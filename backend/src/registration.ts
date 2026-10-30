import { timingSafeEqual } from 'node:crypto';
import type { BackendEnv } from './env.ts';
import { hashSecret, loadActor } from './data.ts';
import type { Database } from './data.ts';
import type { Actor } from './policy.ts';
import { HttpError, jsonResponse, readJsonObject, requireTrustedOrigin } from './http.ts';
import { verifyTurnstile } from './turnstile.ts';
import { authenticateCognito, cognitoConfigured, createCognitoIdentity, resetCognitoPassword, revokeCognitoSessions, validateCognitoPassword, CognitoError } from './cognito.ts';

type Identity = { sub: string; providerUsername: string };
export type AuthDependencies = {
  siteverifyFetch?: Parameters<typeof verifyTurnstile>[0]['fetcher'];
  // Private test seams; never request parameters or environment bindings.
  identity?: {
    create: (input: { username: string; password: string; requestId: string }) => Promise<Identity>;
    authenticate: (input: { providerUsername: string; password: string }) => Promise<Identity>;
    reset: (input: { providerUsername: string; password: string; expectedSub: string }) => Promise<void>;
    revoke: (providerUsername: string, expectedSub: string) => Promise<void>;
  };
};
const lifetime = 12 * 60 * 60_000;
const bootstrapLifetime = 10 * 60_000;
const leaseTime = 90_000;
const unavailable = () => new HttpError(503, 'registration_unavailable', 'Account services are being prepared. Please try again later.', true);
const invalidLogin = () => new HttpError(401, 'invalid_credentials', 'The username or password could not be verified. Please try again or recover your account.', true);
const invalidRecovery = () => new HttpError(400, 'invalid_recovery', 'The username and recovery code could not be verified, or this code was already used.', true);
const reserved = new Set(['prayerbox', 'prayer-box', 'admin', 'administrator', 'support', 'moderator', 'reviewer', 'system']);

export const cognitoMode = (env: BackendEnv) => env.AUTH_PROVIDER === 'cognito' || Boolean(env.COGNITO_USER_POOL_ID?.trim());
function configured(env: BackendEnv) {
  return env.AUTH_PROVIDER === 'cognito' && cognitoConfigured(env) && !!env.AUTH_SIGNING_SECRET && env.AUTH_SIGNING_SECRET.length >= 32 && !!env.TURNSTILE_SECRET && !!env.TURNSTILE_SITE_KEY;
}
export function authCapabilities(env: BackendEnv) {
  const ready = configured(env);
  return { registrationAvailable: ready && env.AUTH_REGISTRATION_ENABLED === 'true', signInAvailable: ready && env.AUTH_SIGNIN_ENABLED === 'true', recoveryAvailable: ready && env.AUTH_RECOVERY_ENABLED === 'true', teenRegistrationAvailable: ready && env.AUTH_TEEN_REGISTRATION_ENABLED === 'true', turnstileSiteKey: ready ? env.TURNSTILE_SITE_KEY! : null };
}
function provider(env: BackendEnv, deps: AuthDependencies) {
  return deps.identity ?? { create: (input: { username: string; password: string; requestId: string }) => createCognitoIdentity(env, input), authenticate: (input: { providerUsername: string; password: string }) => authenticateCognito(env, input), reset: (input: { providerUsername: string; password: string; expectedSub: string }) => resetCognitoPassword(env, input), revoke: (name: string, sub: string) => revokeCognitoSessions(env, name, sub) };
}
function randomHex(bytes = 32) { return [...crypto.getRandomValues(new Uint8Array(bytes))].map(byte => byte.toString(16).padStart(2, '0')).join(''); }
async function hmac(env: BackendEnv, value: string) {
  if (!env.AUTH_SIGNING_SECRET || env.AUTH_SIGNING_SECRET.length < 32) throw unavailable();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.AUTH_SIGNING_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function sameHex(a: string, b: string) { return /^[a-f0-9]{64}$/.test(a) && /^[a-f0-9]{64}$/.test(b) && timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); }
function cookie(request: Request, suffix: string) {
  const name = `${new URL(request.url).protocol === 'https:' ? '__Host-' : ''}pb_${suffix}`;
  const rows = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  return rows.length === 1 ? rows[0].slice(name.length + 1) : null;
}
function setCookie(request: Request, name: string, value: string, seconds: number, strict = false) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${secure ? '__Host-' : ''}pb_${name}=${value}; Path=/; HttpOnly; SameSite=${strict ? 'Strict' : 'Lax'}; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
}
async function validBootstrap(request: Request, env: BackendEnv) {
  const match = /^([a-f0-9]{64})\.(\d{13})\.([a-f0-9]{64})$/.exec(cookie(request, 'auth') ?? '');
  if (!match || Number(match[2]) <= Date.now() || Number(match[2]) > Date.now() + bootstrapLifetime || !sameHex(match[3], await hmac(env, `bootstrap:${match[1]}:${match[2]}`))) return null;
  return { nonce: match[1], expires: Number(match[2]), value: match[0] };
}
async function bootstrap(request: Request, env: BackendEnv) {
  const prior = await validBootstrap(request, env);
  const expires = prior?.expires ?? Date.now() + bootstrapLifetime;
  const nonce = prior?.nonce ?? randomHex();
  const value = prior?.value ?? `${nonce}.${expires}.${await hmac(env, `bootstrap:${nonce}:${expires}`)}`;
  return { cookie: setCookie(request, 'auth', value, Math.floor((expires - Date.now()) / 1000), true), csrfToken: await hmac(env, `csrf:${nonce}:${expires}`) };
}
async function requireBootstrap(request: Request, env: BackendEnv) {
  const current = await validBootstrap(request, env);
  if (!current || !sameHex(request.headers.get('X-CSRF-Token') ?? '', await hmac(env, `csrf:${current.nonce}:${current.expires}`))) throw new HttpError(403, 'invalid_csrf', 'Refresh verification and try again. Your draft can stay open.', true);
}
async function limit(db: Database, env: BackendEnv, purpose: string, value: string, maximum: number) {
  const at = Date.now(); const start = Math.floor(at / 900_000) * 900_000;
  const row = await db.prepare(`INSERT INTO rate_buckets(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key,window_start) DO UPDATE SET count=MIN(count+1,1000000) RETURNING count`)
    .bind(`auth:${purpose}:${await hmac(env, value)}`, start).first<{ count: number }>();
  if (!row || row.count > maximum) throw new HttpError(429, 'rate_limited', 'Please wait up to fifteen minutes before trying account services again.', true);
}
function username(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{3,32}$/.test(value)) throw new HttpError(400, 'invalid_username', 'Use 3–32 letters, numbers, underscores or hyphens for your username.');
  return value.toLowerCase();
}
function password(value: unknown): asserts value is string {
  try { validateCognitoPassword(value); }
  catch { throw new HttpError(400, 'invalid_password', 'Use 15–256 characters. Spaces can go inside a passphrase, but not at its beginning or end. Your password is never trimmed or changed.'); }
}
function allowKeys(input: Record<string, unknown>, keys: string[]) { if (Object.keys(input).some(key => !keys.includes(key))) throw new HttpError(400, 'invalid_account_request', 'Please check the account form and try again.'); }
async function bot(input: Record<string, unknown>, env: BackendEnv, action: string, deps: AuthDependencies) { await verifyTurnstile({ token: input.turnstileToken, secret: env.TURNSTILE_SECRET, expectedAction: action, allowedHostnames: env.TURNSTILE_HOSTNAMES.split(','), fetcher: deps.siteverifyFetch }); }
function mapProviderError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  if (error instanceof CognitoError && error.kind === 'invalid_password') throw new HttpError(400, 'invalid_password', 'This password does not meet the account service’s policy. Use 15–256 characters without leading or trailing whitespace.');
  if (error instanceof CognitoError && error.kind === 'challenge_required') throw new HttpError(403, 'mfa_required', 'This account requires a separate secure verification step. Staff sign-in is not open yet.');
  throw new HttpError(503, 'identity_unavailable', 'We could not confirm the account service. Keep this page open and retry; no new account will be created by retrying the same submission.', true);
}
async function makeCodes(userId: string) {
  const codes = Array.from({ length: 8 }, () => `pbk1-${randomHex(16)}`);
  const rows = await Promise.all(codes.map(async code => ({ id: crypto.randomUUID(), hash: await hashSecret(JSON.stringify(['kit-v1', userId, code])) })));
  return { codes, rows };
}

export async function mappedActor(db: Database, actor: Actor | null, env: BackendEnv): Promise<Actor | null> {
  if (!actor || !cognitoMode(env)) return actor;
  const row = await db.prepare(`SELECT user_id FROM auth_identities WHERE user_id=? AND provider_pool=? AND recovery_lock IS NULL
    AND (?='mfa' OR (NOT EXISTS(SELECT 1 FROM auth_staff_roles WHERE user_id=auth_identities.user_id AND revoked_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=auth_identities.user_id AND status='approved' AND revoked_at IS NULL AND (is_admin=1 OR is_moderator=1 OR role='owner'))))`).bind(actor.id, env.COGNITO_USER_POOL_ID, actor.assurance).first();
  return row ? actor : null;
}
async function authenticated(request: Request, db: Database, env: BackendEnv) {
  const actor = await mappedActor(db, await loadActor(db, cookie(request, 'session')), env);
  const supplied = request.headers.get('X-CSRF-Token') ?? '';
  if (!actor) throw new HttpError(401, 'sign_in_required', 'Please sign in again.');
  if (!/^[a-f0-9]{64}$/.test(supplied) || !sameHex(await hashSecret(supplied), actor.csrfHash)) throw new HttpError(403, 'invalid_csrf', 'Please refresh this page and try again.', true);
  return actor;
}

async function register(request: Request, db: Database, env: BackendEnv, input: Record<string, unknown>, deps: AuthDependencies) {
  allowKeys(input, ['username', 'password', 'ageBand', 'language', 'inviteCode', 'turnstileToken']);
  const name = username(input.username); password(input.password);
  if (reserved.has(name)) throw new HttpError(409, 'username_unavailable', 'Choose a different username.');
  if (!['adult', 'teen'].includes(String(input.ageBand)) || input.language !== 'en') throw new HttpError(400, 'invalid_eligibility', 'Choose your age range and English. This pilot is for ages 13 and older.');
  if (input.ageBand === 'teen' && env.AUTH_TEEN_REGISTRATION_ENABLED !== 'true') throw new HttpError(403, 'safeguarding_pending', 'Teen registration will open after the safeguarding review is complete.');
  if (typeof input.inviteCode !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(input.inviteCode)) throw new HttpError(400, 'invalid_invitation', 'A valid pilot invitation is needed to create an account.');
  const key = request.headers.get('Idempotency-Key') ?? '';
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw new HttpError(400, 'invalid_request_key', 'Refresh the form before creating an account.', true);
  const keyHash = await hashSecret(`register-v1:${key}`);
  const inviteHash = await hashSecret(input.inviteCode);
  // Deliberately contains no password-derived value: D1 is not a password authority.
  const fingerprint = await hashSecret(JSON.stringify([name, input.ageBand, input.language, inviteHash]));
  await limit(db, env, 'register-name', name, 8);
  await bot(input, env, 'register', deps);
  let intent = await db.prepare('SELECT * FROM auth_registrations WHERE key_hash=?').bind(keyHash).first<{ id: string; request_hash: string; username: string; user_id: string; invite_id: string; state: string; lease_until?: number }>();
  if (intent && intent.request_hash !== fingerprint) throw new HttpError(409, 'request_key_conflict', 'This submission changed. Start a fresh account submission.');
  if (intent?.state === 'provider_write' && (intent.lease_until ?? 0) > Date.now()) throw new HttpError(409, 'registration_pending', 'This submission is still being confirmed. Keep this form open and try again shortly.', true);
  if (intent?.state === 'reconcile' || intent?.state === 'provider_write') throw new HttpError(503, 'registration_reconciliation_required', 'This account attempt needs a secure service review before it can continue. Please keep your username and use the help route; do not start a second attempt with this invitation.');
  if (intent?.state === 'complete') return jsonResponse({ registered: true, username: name, recoveryCodes: [], message: 'Your account was already created. Sign in to create a replacement recovery kit if the first response did not reach you.' });
  if (!intent) {
    const conflict = await db.prepare('SELECT id FROM users WHERE username=? COLLATE NOCASE').bind(name).first();
    if (conflict) throw new HttpError(409, 'username_unavailable', 'Choose a different username.');
    const invite = await db.prepare('SELECT id FROM auth_invites WHERE token_hash=? AND age_band=? AND revoked_at IS NULL AND used_at IS NULL AND expires_at>? AND claim_id IS NULL').bind(inviteHash, input.ageBand, Date.now()).first<{ id: string }>();
    if (!invite) throw new HttpError(400, 'invalid_invitation', 'This invitation is unavailable or already used.');
    const id = crypto.randomUUID(); const userId = crypto.randomUUID();
    try {
      const saved = await db.batch([
        db.prepare('UPDATE auth_invites SET claim_id=? WHERE id=? AND token_hash=? AND claim_id IS NULL AND used_at IS NULL AND revoked_at IS NULL AND expires_at>?').bind(id, invite.id, inviteHash, Date.now()),
        db.prepare(`INSERT INTO auth_registrations(id,key_hash,request_hash,username,age_band,invite_id,user_id,state,created_at) SELECT ?,?,?,?,?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM auth_invites WHERE id=? AND claim_id=?)`).bind(id, keyHash, fingerprint, name, input.ageBand, invite.id, userId, Date.now(), invite.id, id),
      ]);
      if (saved[1].meta.changes !== 1) throw new HttpError(409, 'invitation_busy', 'This invitation is already being used.');
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(409, 'registration_conflict', 'This username or invitation is already in use. Retry the original submission or choose a different username.', true);
    }
    intent = { id, request_hash: fingerprint, username: name, user_id: userId, invite_id: invite.id, state: 'pending' };
  }
  const at = Date.now(); const lease = crypto.randomUUID();
  const claimed = await db.prepare(`UPDATE auth_registrations SET lease_token=?,lease_until=? WHERE id=? AND state='pending' AND (lease_until IS NULL OR lease_until<?)
    AND EXISTS(SELECT 1 FROM auth_invites i WHERE i.id=invite_id AND i.claim_id=auth_registrations.id AND i.token_hash=? AND i.revoked_at IS NULL AND i.used_at IS NULL AND i.expires_at>?) RETURNING id`).bind(lease, at + leaseTime, intent.id, at, inviteHash, at).first();
  if (!claimed) throw new HttpError(409, 'registration_pending', 'This submission is still being confirmed, or its invitation has expired. Keep the form open and try again shortly.', true);
  let providerSettled = false;
  try {
    const fenced = await db.prepare("UPDATE auth_registrations SET state='provider_write' WHERE id=? AND lease_token=? AND state='pending' RETURNING id").bind(intent.id, lease).first();
    if (!fenced) throw unavailable();
    let identity: Identity;
    try { identity = await provider(env, deps).create({ username: name, password: input.password, requestId: intent.id }); }
    catch (error) {
      if (!(error instanceof CognitoError) || error.kind !== 'identity_exists') throw error;
      identity = await provider(env, deps).authenticate({ providerUsername: `pb-${intent.id}`, password: input.password });
    }
    if (identity.providerUsername !== `pb-${intent.id}` || !/^[a-f0-9-]{36}$/.test(identity.sub)) throw unavailable();
    providerSettled = true;
    await db.prepare("UPDATE auth_registrations SET state='pending' WHERE id=? AND lease_token=? AND state='provider_write'").bind(intent.id, lease).run();
    const kit = await makeCodes(intent.user_id); const commitAt = Date.now();
    const guard = `EXISTS(SELECT 1 FROM auth_registrations r JOIN auth_invites i ON i.id=r.invite_id WHERE r.id=? AND r.lease_token=? AND r.state='pending' AND r.lease_until>? AND i.claim_id=r.id AND i.used_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>?)`;
    const values = [intent.id, lease, commitAt, commitAt];
    const result = await db.batch([
      db.prepare(`INSERT INTO users(id,username,display_name,status,visibility,created_at) SELECT ?,?,?,'active','private',? WHERE ${guard}`).bind(intent.user_id, name, name, commitAt, ...values),
      db.prepare(`INSERT INTO boxes(id,kind,owner_id,slug,display_name,visibility,created_at) SELECT ?,'personal',?,?,?,'private',? FROM users WHERE id=? AND ${guard}`).bind(crypto.randomUUID(), intent.user_id, `p-${intent.user_id}`, `${name}’s Prayer Box`, commitAt, intent.user_id, ...values),
      db.prepare(`INSERT INTO auth_identities(user_id,provider_pool,provider_subject,provider_username,age_band,created_at) SELECT ?,?,?,?,?,? FROM users WHERE id=? AND ${guard}`).bind(intent.user_id, env.COGNITO_USER_POOL_ID, identity.sub, identity.providerUsername, input.ageBand, commitAt, intent.user_id, ...values),
      ...kit.rows.map(row => db.prepare(`INSERT INTO auth_recovery_codes(id,user_id,code_hash,created_at) SELECT ?,?,?,? FROM users WHERE id=? AND ${guard}`).bind(row.id, intent!.user_id, row.hash, commitAt, intent!.user_id, ...values)),
      db.prepare(`UPDATE auth_invites SET used_at=? WHERE id=? AND claim_id=? AND ${guard}`).bind(commitAt, intent.invite_id, intent.id, ...values),
      db.prepare(`UPDATE auth_registrations SET state='complete',completed_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND EXISTS(SELECT 1 FROM auth_identities WHERE user_id=? AND provider_subject=?)`).bind(commitAt, intent.id, lease, intent.user_id, identity.sub),
    ]);
    if (result[0].meta.changes !== 1 || result.at(-1)?.meta.changes !== 1) throw new HttpError(409, 'registration_pending', 'This account needs another confirmation attempt. Keep this form open.', true);
    return jsonResponse({ registered: true, username: name, recoveryCodes: kit.codes }, 201);
  } catch (error) {
    if (!providerSettled && !(error instanceof CognitoError && error.kind === 'invalid_password')) {
      // A timed-out credential mutation may still complete at AWS. Never send a
      // second password mutation after an unknown outcome, even with a new key.
      await db.prepare("UPDATE auth_registrations SET state='reconcile' WHERE id=? AND lease_token=? AND state IN ('pending','provider_write')").bind(intent.id, lease).run();
      throw new HttpError(503, 'registration_reconciliation_required', 'This account attempt needs a secure service review before it can continue. Use the help route and do not start another attempt with this invitation.');
    }
    if (!providerSettled) await db.prepare("UPDATE auth_registrations SET state='pending' WHERE id=? AND lease_token=? AND state='provider_write'").bind(intent.id, lease).run();
    mapProviderError(error);
  }
  finally { await db.prepare("UPDATE auth_registrations SET lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND state='pending'").bind(intent.id, lease).run(); }
}

async function signIn(request: Request, db: Database, env: BackendEnv, input: Record<string, unknown>, deps: AuthDependencies) {
  allowKeys(input, ['username', 'password', 'turnstileToken']);
  const name = username(input.username); password(input.password);
  await limit(db, env, 'signin-name', name, 10); await bot(input, env, 'signin', deps);
  const identity = await db.prepare(`SELECT i.*,u.session_epoch FROM auth_identities i JOIN users u ON u.id=i.user_id WHERE u.username=? COLLATE NOCASE AND u.status='active' AND i.provider_pool=? AND i.recovery_lock IS NULL`).bind(name, env.COGNITO_USER_POOL_ID).first<{ user_id: string; provider_username: string; provider_subject: string; session_epoch: number }>();
  let proof: Identity;
  try { proof = await provider(env, deps).authenticate({ providerUsername: identity?.provider_username ?? 'pb-00000000-0000-4000-8000-000000000000', password: input.password }); }
  catch (error) { if (error instanceof CognitoError && ['unavailable', 'protocol_error', 'challenge_required'].includes(error.kind)) mapProviderError(error); throw invalidLogin(); }
  if (!identity || proof.providerUsername !== identity.provider_username || proof.sub !== identity.provider_subject) throw invalidLogin();
  const privileged = await db.prepare(`SELECT 1 AS privileged WHERE EXISTS(SELECT 1 FROM auth_staff_roles WHERE user_id=? AND revoked_at IS NULL) OR EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND status='approved' AND revoked_at IS NULL AND (is_admin=1 OR is_moderator=1 OR role='owner'))`).bind(identity.user_id, identity.user_id).first();
  if (privileged) throw new HttpError(403, 'mfa_required', 'This account requires MFA. Staff and group-administrator sign-in will open after secure verification is configured.');
  const at = Date.now(); const token = randomHex(); const csrf = await hashSecret(`csrf:${token}`);
  const result = await db.batch([
    db.prepare(`INSERT INTO sessions(id,token_hash,csrf_hash,user_id,session_epoch,assurance,authenticated_at,expires_at,created_at)
      SELECT ?,?,?,u.id,u.session_epoch,'basic',?,?,? FROM users u JOIN auth_identities i ON i.user_id=u.id
      WHERE u.id=? AND u.status='active' AND u.session_epoch=? AND i.recovery_lock IS NULL AND i.provider_pool=? AND i.provider_subject=?
      AND NOT EXISTS(SELECT 1 FROM auth_staff_roles WHERE user_id=u.id AND revoked_at IS NULL)
      AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=u.id AND status='approved' AND revoked_at IS NULL AND (is_admin=1 OR is_moderator=1 OR role='owner'))`).bind(crypto.randomUUID(), await hashSecret(token), await hashSecret(csrf), at, at + lifetime, at, identity.user_id, identity.session_epoch, env.COGNITO_USER_POOL_ID, proof.sub),
    db.prepare('UPDATE sessions SET revoked_at=? WHERE token_hash=? AND revoked_at IS NULL').bind(at, await hashSecret(cookie(request, 'session') ?? '')),
  ]);
  if (result[0].meta.changes !== 1) throw invalidLogin();
  return jsonResponse({ signedIn: true }, 200, { 'Set-Cookie': setCookie(request, 'session', token, lifetime / 1000) });
}

async function rotateKit(request: Request, db: Database, env: BackendEnv) {
  const actor = await authenticated(request, db, env);
  if (actor.authenticatedAt < Date.now() - 300_000) throw new HttpError(403, 'recent_signin_required', 'Sign in again before replacing your recovery kit.');
  allowKeys(await readJsonObject(request, { maxBytes: 1024 }), []);
  await limit(db, env, 'rotate-kit', actor.id, 3);
  const kit = await makeCodes(actor.id); const at = Date.now(); const marker = crypto.randomUUID();
  const guard = `EXISTS(SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id JOIN auth_identities i ON i.user_id=u.id WHERE s.id=? AND s.user_id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.session_epoch=u.session_epoch AND s.csrf_hash=? AND s.authenticated_at>=? AND u.status='active' AND i.recovery_lock IS NULL AND i.provider_pool=?
      AND (s.assurance='mfa' OR (NOT EXISTS(SELECT 1 FROM auth_staff_roles WHERE user_id=u.id AND revoked_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=u.id AND status='approved' AND revoked_at IS NULL AND (is_admin=1 OR is_moderator=1 OR role='owner')))))`;
  const values = [actor.sessionId, actor.id, at, actor.csrfHash, at - 300_000, env.COGNITO_USER_POOL_ID];
  const result = await db.batch([
    db.prepare(`UPDATE auth_recovery_codes SET state='revoked',attempt_id=NULL WHERE user_id=? AND state='available' AND ${guard}`).bind(actor.id, ...values),
    ...kit.rows.map(row => db.prepare(`INSERT INTO auth_recovery_codes(id,user_id,code_hash,created_at) SELECT ?,?,?,? WHERE ${guard}`).bind(`${marker}-${row.id}`, actor.id, row.hash, at, ...values)),
  ]);
  if (result[1].meta.changes !== 1) throw new HttpError(401, 'session_expired', 'Sign in again before replacing your recovery kit.');
  return jsonResponse({ recoveryCodes: kit.codes });
}

async function recover(db: Database, env: BackendEnv, input: Record<string, unknown>, deps: AuthDependencies) {
  allowKeys(input, ['username', 'recoveryCode', 'newPassword', 'turnstileToken']);
  const name = username(input.username); password(input.newPassword);
  if (typeof input.recoveryCode !== 'string' || !/^pbk1-[a-f0-9]{32}$/.test(input.recoveryCode)) throw invalidRecovery();
  await limit(db, env, 'recover-name', name, 5); await bot(input, env, 'recover', deps);
  const identity = await db.prepare(`SELECT i.*,u.session_epoch FROM auth_identities i JOIN users u ON u.id=i.user_id WHERE u.username=? COLLATE NOCASE AND u.status='active' AND i.provider_pool=?`).bind(name, env.COGNITO_USER_POOL_ID).first<{ user_id: string; provider_username: string; provider_subject: string; recovery_lock: string | null; session_epoch: number }>();
  const codeHash = await hashSecret(JSON.stringify(['kit-v1', identity?.user_id ?? 'unknown', input.recoveryCode]));
  const code = identity ? await db.prepare("SELECT id,state,attempt_id FROM auth_recovery_codes WHERE user_id=? AND code_hash=? AND state IN ('available','reserved')").bind(identity.user_id, codeHash).first<{ id: string; state: string; attempt_id: string | null }>() : null;
  if (!identity || !code) throw invalidRecovery();
  let attemptId = code.attempt_id;
  if (code.state === 'available') {
    attemptId = crypto.randomUUID(); const at = Date.now();
    const result = await db.batch([
      db.prepare(`INSERT INTO auth_recovery_attempts(id,user_id,code_id,state,created_at) SELECT ?,?,?,'pending',? WHERE EXISTS(SELECT 1 FROM auth_recovery_codes c JOIN auth_identities i ON i.user_id=c.user_id JOIN users u ON u.id=c.user_id WHERE c.id=? AND c.state='available' AND i.recovery_lock IS NULL AND u.status='active')`).bind(attemptId, identity.user_id, code.id, at, code.id),
      db.prepare("UPDATE auth_recovery_codes SET state='reserved',attempt_id=? WHERE id=? AND state='available' AND EXISTS(SELECT 1 FROM auth_recovery_attempts WHERE id=?)").bind(attemptId, code.id, attemptId),
      db.prepare('UPDATE auth_identities SET recovery_lock=? WHERE user_id=? AND recovery_lock IS NULL AND EXISTS(SELECT 1 FROM auth_recovery_attempts WHERE id=?)').bind(attemptId, identity.user_id, attemptId),
      db.prepare('UPDATE users SET session_epoch=session_epoch+1 WHERE id=? AND EXISTS(SELECT 1 FROM auth_identities WHERE user_id=? AND recovery_lock=?)').bind(identity.user_id, identity.user_id, attemptId),
      db.prepare('UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM auth_identities WHERE user_id=? AND recovery_lock=?)').bind(at, identity.user_id, identity.user_id, attemptId),
    ]);
    if (result[0].meta.changes !== 1 || result[2].meta.changes !== 1) throw invalidRecovery();
  }
  if (!attemptId) throw invalidRecovery();
  const currentAttempt = await db.prepare('SELECT state,lease_until FROM auth_recovery_attempts WHERE id=?').bind(attemptId).first<{state:string;lease_until?:number}>();
  if (currentAttempt?.state === 'provider_write' && (currentAttempt.lease_until ?? 0) > Date.now()) throw new HttpError(409, 'recovery_pending', 'This recovery is still being confirmed. Keep this form open and try again shortly.', true);
  if (currentAttempt?.state === 'provider_write') throw new HttpError(503, 'recovery_reconciliation_required', 'Recovery needs a secure service review. Keep your recovery code private and use the help route.');
  if (currentAttempt?.state === 'reconcile') throw new HttpError(503, 'recovery_reconciliation_required', 'Recovery needs a secure service review. Previous sessions remain signed out; keep your recovery code private and use the help route.');
  const lease = crypto.randomUUID(); const at = Date.now();
  const claimed = await db.prepare(`UPDATE auth_recovery_attempts SET lease_token=?,lease_until=? WHERE id=? AND code_id=? AND state='pending' AND (lease_until IS NULL OR lease_until<?)
    AND EXISTS(SELECT 1 FROM auth_identities i JOIN users u ON u.id=i.user_id WHERE i.user_id=auth_recovery_attempts.user_id AND i.recovery_lock=auth_recovery_attempts.id AND i.provider_pool=? AND i.provider_subject=? AND u.status='active') RETURNING id`).bind(lease, at + leaseTime, attemptId, code.id, at, env.COGNITO_USER_POOL_ID, identity.provider_subject).first();
  if (!claimed) throw new HttpError(409, 'recovery_pending', 'This recovery is still being confirmed. Keep the code and try again shortly.', true);
  let passwordSetConfirmed = false;
  try {
    const fenced = await db.prepare("UPDATE auth_recovery_attempts SET state='provider_write' WHERE id=? AND lease_token=? AND state='pending' RETURNING id").bind(attemptId, lease).first();
    if (!fenced) throw invalidRecovery();
    await provider(env, deps).reset({ providerUsername: identity.provider_username, expectedSub: identity.provider_subject, password: input.newPassword });
    passwordSetConfirmed = true;
    await provider(env, deps).revoke(identity.provider_username, identity.provider_subject);
    const doneAt = Date.now();
    const guard = `EXISTS(SELECT 1 FROM auth_recovery_attempts r JOIN auth_identities i ON i.user_id=r.user_id JOIN users u ON u.id=i.user_id WHERE r.id=? AND r.lease_token=? AND r.lease_until>? AND r.state='provider_write' AND i.recovery_lock=r.id AND i.provider_subject=? AND u.status='active')`;
    const values = [attemptId, lease, doneAt, identity.provider_subject];
    const result = await db.batch([
      db.prepare(`UPDATE auth_recovery_codes SET state=CASE WHEN id=? THEN 'used' ELSE 'revoked' END,used_at=?,attempt_id=NULL WHERE user_id=? AND ${guard}`).bind(code.id, doneAt, identity.user_id, ...values),
      db.prepare(`UPDATE auth_recovery_attempts SET state='complete',completed_at=? WHERE id=? AND ${guard}`).bind(doneAt, attemptId, ...values),
      db.prepare(`UPDATE auth_identities SET recovery_lock=NULL WHERE user_id=? AND recovery_lock=? AND EXISTS(SELECT 1 FROM auth_recovery_attempts WHERE id=? AND state='complete' AND lease_token=?)`).bind(identity.user_id, attemptId, attemptId, lease),
    ]);
    if (result[2].meta.changes !== 1) throw invalidRecovery();
    return jsonResponse({ reset: true, message: 'Your password has been changed and old sessions and recovery codes are invalid. Sign in to save a replacement recovery kit.' });
  } catch (error) {
    if (passwordSetConfirmed || !(error instanceof CognitoError && error.kind === 'invalid_password')) {
      await db.prepare("UPDATE auth_recovery_attempts SET state='reconcile' WHERE id=? AND lease_token=? AND state IN ('pending','provider_write')").bind(attemptId, lease).run();
      throw new HttpError(503, 'recovery_reconciliation_required', 'Recovery needs a secure service review. Previous sessions remain signed out; keep your recovery code private and use the help route.');
    }
    await db.prepare("UPDATE auth_recovery_attempts SET state='pending' WHERE id=? AND lease_token=? AND state='provider_write'").bind(attemptId, lease).run();
    mapProviderError(error);
  }
  finally { await db.prepare("UPDATE auth_recovery_attempts SET lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=? AND state='pending'").bind(attemptId, lease).run(); }
}

export async function handleAuthRoute(request: Request, env: BackendEnv, db: Database, deps: AuthDependencies = {}): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/auth/')) return null;
  if (env.APP_ENV !== 'local' && (url.protocol !== 'https:' || url.origin !== env.APP_ORIGIN)) throw unavailable();
  const capabilities = authCapabilities(env);
  if (path === '/api/auth/config' && request.method === 'GET') {
    if (request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, 'untrusted_origin', 'This request is not available.');
    if (!capabilities.registrationAvailable && !capabilities.signInAvailable && !capabilities.recoveryAvailable) return jsonResponse({ ...capabilities, csrfToken: null });
    await limit(db, env, 'bootstrap', request.headers.get('CF-Connecting-IP') ?? 'unknown', 30);
    const next = await bootstrap(request, env);
    return jsonResponse({ ...capabilities, csrfToken: next.csrfToken }, 200, { 'Set-Cookie': next.cookie });
  }
  if (!['/api/auth/register', '/api/auth/signin', '/api/auth/recover', '/api/auth/recovery-kit/rotate'].includes(path)) throw new HttpError(404, 'not_found', 'This item is not available.');
  if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Use the account form.');
  requireTrustedOrigin(request, [env.APP_ORIGIN]);
  const available = path.endsWith('/register') ? capabilities.registrationAvailable : path.endsWith('/recover') ? capabilities.recoveryAvailable : capabilities.signInAvailable;
  if (!available) throw unavailable();
  if (path.endsWith('/rotate')) { if (!capabilities.recoveryAvailable) throw unavailable(); return rotateKit(request, db, env); }
  await requireBootstrap(request, env);
  await limit(db, env, 'ip', request.headers.get('CF-Connecting-IP') ?? 'unknown', 30);
  const input = await readJsonObject(request, { maxBytes: 8192 });
  if (path.endsWith('/register')) return register(request, db, env, input, deps);
  if (path.endsWith('/signin')) return signIn(request, db, env, input, deps);
  return recover(db, env, input, deps);
}
