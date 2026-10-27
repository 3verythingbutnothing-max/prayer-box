import { hashSecret, loadActor, primary } from './data.ts';
import type { Database } from './data.ts';
import type { Actor } from './policy.ts';
import type { BackendEnv } from './env.ts';
import { HttpError, errorResponse, jsonResponse, readJsonObject, requireTrustedOrigin } from './http.ts';
import { verifyTurnstile } from './turnstile.ts';
import { consumeDeadLetterBatch, consumeJobBatch, dispatchOutbox } from './jobs.ts';
import { handleRead } from './reads.ts';
import { uploadFeedbackPicture } from './uploads.ts';

type Dependencies = { siteverifyFetch?: Parameters<typeof verifyTurnstile>[0]['fetcher'] };
const loopback = new Set(['localhost', '127.0.0.1', '[::1]']);

function sessionToken(request: Request): string | null {
  const name = new URL(request.url).protocol === 'https:' ? '__Host-pb_session' : 'pb_session';
  const values = (request.headers.get('cookie') ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}

async function requireMutation(request: Request, env: BackendEnv, actor: Actor | null): Promise<Actor> {
  requireTrustedOrigin(request, [env.APP_ORIGIN]);
  if (!actor) throw new HttpError(401, 'sign_in_required', 'Please sign in before sending this.', false);
  const csrf = request.headers.get('X-CSRF-Token') ?? '';
  if (!/^[a-f0-9]{64}$/.test(csrf)) throw new HttpError(403, 'invalid_csrf', 'Please refresh this page and try again.', true);
  const actual = await hashSecret(csrf);
  let different = actual.length ^ actor.csrfHash.length;
  for (let index = 0; index < actual.length; index++) different |= actual.charCodeAt(index) ^ (actor.csrfHash.charCodeAt(index) || 0);
  if (different) throw new HttpError(403, 'invalid_csrf', 'Please refresh this page and try again.', true);
  return actor;
}

async function feedback(request: Request, db: Database, env: BackendEnv, actor: Actor, dependencies: Dependencies): Promise<Response> {
  const input = await readJsonObject(request, { maxBytes: 16_384 });
  if (Object.keys(input).some(key => !['category', 'body', 'turnstileToken'].includes(key)) ||
      typeof input.category !== 'string' || !['bug', 'feature', 'other'].includes(input.category) ||
      typeof input.body !== 'string' || input.body.trim().length < 1 || input.body.trim().length > 3000) {
    throw new HttpError(400, 'invalid_feedback', 'Choose a category and write between 1 and 3,000 characters.');
  }
  const key = request.headers.get('Idempotency-Key') ?? '';
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new HttpError(400, 'invalid_request_key', 'Please refresh this page before sending.', true);
  const body = input.body.trim();
  const requestHash = await hashSecret(JSON.stringify(['feedback', input.category, body]));
  async function replay(): Promise<Response | null> {
    const at = Date.now();
    const current = await db.prepare(`SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.user_id = ? AND s.session_epoch = ? AND s.csrf_hash = ?
        AND s.session_epoch = u.session_epoch AND s.revoked_at IS NULL AND s.expires_at > ?
        AND s.created_at <= ? AND s.authenticated_at <= ? AND u.status = 'active'`)
      .bind(actor.sessionId, actor.id, actor.sessionEpoch, actor.csrfHash, at, at, at).first();
    if (!current) throw new HttpError(401, 'session_expired', 'Please sign in again before sending.');
    const prior = await db.prepare(`SELECT i.request_hash, f.id, f.status, f.deleted_at
      FROM idempotency i LEFT JOIN feedback f ON f.id = i.resource_id AND f.owner_id = i.owner_id
      WHERE i.owner_id = ? AND i.key = ?`).bind(actor.id, key)
      .first<{ request_hash: string; id: string | null; status: string; deleted_at: number | null }>();
    if (!prior) return null;
    if (prior.request_hash !== requestHash) throw new HttpError(409, 'request_key_conflict', 'This submission changed. Start a new submission to send it.');
    if (!prior.id || prior.deleted_at !== null || prior.status === 'deleted') throw new HttpError(410, 'feedback_removed', 'This submission is no longer available.');
    return jsonResponse({ id: prior.id, status: prior.status }, 202);
  }
  const existing = await replay();
  if (existing) return existing;
  const now = Date.now();
  const window = 10 * 60_000;
  const start = Math.floor(now / window) * window;
  const bucket = await db.prepare(`INSERT INTO rate_buckets(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key,window_start) DO UPDATE SET count = MIN(count + 1, 1000000) RETURNING count`)
    .bind(`feedback:${actor.id}`, start).first<{ count: number }>();
  if (!bucket || bucket.count > 5) {
    const response = errorResponse(new HttpError(429, 'rate_limited', 'Please wait a few minutes before sending another report.', true));
    response.headers.set('Retry-After', String(Math.ceil((start + window - now) / 1000)));
    return response;
  }
  await verifyTurnstile({ token: input.turnstileToken, secret: env.TURNSTILE_SECRET,
    expectedAction: 'feedback', allowedHostnames: env.TURNSTILE_HOSTNAMES.split(','), fetcher: dependencies.siteverifyFetch });
  const id = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const acceptedAt = Date.now();
  try {
    const result = await db.batch([
      db.prepare(`INSERT INTO feedback(id,owner_id,category,body,status,created_at,updated_at)
        SELECT ?,u.id,?,?,'received',?,? FROM users u JOIN sessions s ON s.user_id = u.id
        WHERE u.id = ? AND u.status = 'active' AND s.id = ? AND s.revoked_at IS NULL
          AND s.session_epoch = u.session_epoch AND s.session_epoch = ? AND s.csrf_hash = ?
          AND s.expires_at > ? AND s.created_at <= ? AND s.authenticated_at <= ?`)
        .bind(id, input.category, body, acceptedAt, acceptedAt, actor.id, actor.sessionId,
          actor.sessionEpoch, actor.csrfHash, acceptedAt, acceptedAt, acceptedAt),
      db.prepare(`INSERT INTO idempotency(owner_id,key,request_hash,resource_id,created_at)
        SELECT owner_id,?,?,id,? FROM feedback WHERE id = ?`).bind(key, requestHash, acceptedAt, id),
      db.prepare(`INSERT INTO jobs(id,kind,resource_id,recipient_id,state,next_attempt_at,next_dispatch_at,created_at,updated_at)
        SELECT ?,'feedback_triage',id,owner_id,'pending',?,?,?,? FROM feedback WHERE id = ?`)
        .bind(jobId, acceptedAt, acceptedAt, acceptedAt, acceptedAt, id),
    ]);
    if (result[0].meta.changes !== 1) throw new HttpError(401, 'session_expired', 'Please sign in again before sending.');
  } catch (error) {
    // D1 rolls back the whole batch on a duplicate idempotency key, including the new report.
    const duplicate = await replay();
    if (duplicate) return duplicate;
    throw error;
  }
  return jsonResponse({ id, status: 'received' }, 202);
}

export async function handleRequest(request: Request, env: BackendEnv, dependencies: Dependencies = {}): Promise<Response> {
  try {
    const url = new URL(request.url);
    // This configuration deliberately cannot become a public intake by deployment alone.
    if (env.APP_ENV === 'local' && !loopback.has(url.hostname)) {
      throw new HttpError(503, 'launch_not_enabled', 'Prayer Box sign-in is not open yet.');
    }
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api' && !url.pathname.startsWith('/media/') && url.pathname !== '/media') {
      if (env.APP_ENV === 'local' && url.origin !== env.APP_ORIGIN && request.method === 'GET') {
        return Response.redirect(`${env.APP_ORIGIN}${url.pathname}${url.search}${url.hash}`, 307);
      }
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('Referrer-Policy', 'no-referrer');
      response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self'; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
      return response;
    }
    if (url.pathname === '/api/health' && request.method === 'GET') return jsonResponse({ status: 'local', liveIntake: false });
    const db = primary(env.DB);
    const token = sessionToken(request);
    const actor = await loadActor(db, token);
    if (url.pathname === '/api/session' && request.method === 'GET') {
      return jsonResponse({ authenticated: Boolean(actor), actor: actor ? { id: actor.id, username: actor.username, displayName: actor.displayName } : null,
        csrfToken: actor && token ? await hashSecret(`csrf:${token}`) : null,
        capabilities: { signIn: false, feedback: Boolean(env.TURNSTILE_SECRET && env.TURNSTILE_SITE_KEY), turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null } });
    }
    if (request.method === 'GET') {
      const response = await handleRead(request, db, env, actor);
      if (response) return response;
    }
    if (request.method === 'POST') {
      const verified = await requireMutation(request, env, actor);
      if (url.pathname === '/api/feedback') return await feedback(request, db, env, verified, dependencies);
      const upload = url.pathname.match(/^\/api\/feedback\/([A-Za-z0-9_-]{1,160})\/pictures$/);
      if (upload) return await uploadFeedbackPicture(request, db, env, verified, upload[1]);
      if (url.pathname === '/api/session/logout') {
        await db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ?').bind(Date.now(), verified.sessionId, verified.id).run();
        const cookie = url.protocol === 'https:' ? '__Host-pb_session=; Secure' : 'pb_session=';
        return jsonResponse({ signedOut: true }, 200, { 'Set-Cookie': `${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
      }
    }
    throw new HttpError(404, 'not_found', 'This item is not available.');
  } catch (error) { return errorResponse(error); }
}

export default {
  fetch: (request, env) => handleRequest(request, env),
  async scheduled(_event, env) { await dispatchOutbox(env.DB, env.JOBS); },
  async queue(batch, env) {
    if (batch.queue === 'prayer-box-local-dead') await consumeDeadLetterBatch(batch, env.DB);
    else await consumeJobBatch(batch, env.DB);
  },
} satisfies ExportedHandler<BackendEnv>;
