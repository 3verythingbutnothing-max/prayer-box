import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../src/index';
import { handleRecoveryRoute, hashRecoveryPassword, recoveryAvailable, verifyRecoveryPassword } from '../src/account-recovery';
import type { RecoveryDependencies } from '../src/account-recovery';
import type { BackendEnv } from '../src/env';
import { primary, type Database } from '../src/data';
import { errorResponse } from '../src/http';
import { NOW, ORIGIN, resetDatabase, seedUsers, session } from './fixtures';

const password = 'A fresh private prayer phrase';
type Sent = Parameters<NonNullable<RecoveryDependencies['deliverRecoveryCode']>>[0];
const configured = (): BackendEnv => ({ ...env, RECOVERY_CODE_SECRET: 'synthetic-recovery-key-at-least-thirty-two-characters', TURNSTILE_SECRET: 'synthetic-turnstile-secret', TURNSTILE_SITE_KEY: 'synthetic-site-key' });
function harness(deliver?: (input: Sent) => Promise<void>) {
  const sent: Sent[] = []; const tasks: Promise<unknown>[] = [];
  const dependencies: RecoveryDependencies = {
    siteverifyFetch: async () => Response.json({ success: true, action: 'recovery', hostname: 'localhost' }),
    deliverRecoveryCode: async input => { sent.push(input); if (deliver) await deliver(input); },
    waitUntil: task => { tasks.push(task); },
  };
  return { sent, tasks, dependencies, flush: () => Promise.all(tasks) };
}
type Harness = ReturnType<typeof harness>;
function request(path: string, body: unknown, headers: Record<string, string> = {}) { return new Request(`${ORIGIN}${path}`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }); }
const startBody = (username = 'author-handle', channel = 'email') => ({ username, channel, turnstileToken: 'synthetic-valid-token' });
const post = (path: string, body: unknown, h: Harness, headers: Record<string, string> = {}) => handleRequest(request(path, body, headers), configured(), h.dependencies);
async function begin(h: Harness, username = 'author-handle', channel = 'email') {
  const response = await post('/api/recovery/start', startBody(username, channel), h);
  expect(response.status).toBe(202); const result = await response.json() as { challengeId: string; message: string };
  await h.flush(); return result;
}
function complete(h: Harness, challengeId: string, code: string, newPassword = password) { return post('/api/recovery/complete', { challengeId, code, newPassword }, h); }
async function credential() { return env.DB.prepare('SELECT password_hash,version FROM account_credentials WHERE user_id=?').bind('author').first<{ password_hash: string; version: number }>(); }
async function raceComplete(h: Harness, challengeId: string, code: string, change: () => Promise<unknown>) {
  const db = primary(env.DB); const racing: Database = { prepare: db.prepare.bind(db), batch: async statements => { await change(); return db.batch(statements); } };
  try { return await handleRecoveryRoute(request('/api/recovery/complete', { challengeId, code, newPassword: password }), configured(), racing, h.dependencies); }
  catch (error) { return errorResponse(error); }
}
beforeEach(async () => {
  await resetDatabase(); await seedUsers();
  await env.DB.prepare("INSERT INTO account_credentials(user_id,password_hash,updated_at) VALUES('author','previous-password-hash',?)").bind(NOW).run();
  await env.DB.prepare("INSERT INTO recovery_contacts(id,user_id,channel,destination,verified_at) VALUES('verified-email','author','email','fictional-author@example.invalid',?)").bind(NOW - 1000).run();
});

describe('verified-contact recovery in the local Workers runtime', () => {
  it('keeps capabilities closed until all real bindings and verification configuration exist', async () => {
    expect(recoveryAvailable(configured())).toBe(false);
    const h = harness();
    const response = await handleRequest(request('/api/recovery/start', startBody()), configured(), { ...h.dependencies, deliverRecoveryCode: undefined });
    expect(response.status).toBe(503);
    expect(await env.DB.prepare('SELECT id FROM recovery_challenges').first()).toBeNull();
    const missingSecret = await handleRequest(request('/api/recovery/start', startBody()), { ...configured(), RECOVERY_CODE_SECRET: 'short' }, h.dependencies);
    expect(missingSecret.status).toBe(503);
    const missingLifecycle = await handleRequest(request('/api/recovery/start', startBody()), configured(), { ...h.dependencies, waitUntil: undefined });
    expect(missingLifecycle.status).toBe(503);
  });
  it('uses the same public message and shape for eligible, unknown and unverified accounts', async () => {
    await env.DB.prepare("INSERT INTO account_credentials(user_id,password_hash,updated_at) VALUES('recipient','fixture',?)").bind(NOW).run();
    await env.DB.prepare("INSERT INTO recovery_contacts(id,user_id,channel,destination,verified_at) VALUES('future-email','recipient','email','unverified@example.invalid',?)").bind(Date.now() + 100000).run();
    const h = harness(); const known = await begin(h, 'AUTHOR-HANDLE'); const unknown = await begin(h, 'unknown-handle'); const unverified = await begin(h, 'recipient-handle');
    expect(Object.keys(known).sort()).toEqual(['challengeId', 'message']);
    expect(known.message).toBe(unknown.message); expect(known.message).toBe(unverified.message);
    expect(h.sent).toHaveLength(1); expect(h.sent[0].destination).toBe('fictional-author@example.invalid');
    expect(JSON.stringify([known, unknown, unverified])).not.toContain(h.sent[0].code);
    expect(JSON.stringify([known, unknown, unverified])).not.toContain('@');
    const states = await env.DB.prepare('SELECT state FROM recovery_challenges ORDER BY state').all<{ state: string }>();
    expect(states.results.map(row => row.state)).toEqual(['failed', 'failed', 'ready']);
  });
  it('uses only the stored verified selected channel and rejects supplied destination or contact lookup fields', async () => {
    await env.DB.prepare("INSERT INTO recovery_contacts(id,user_id,channel,destination,verified_at) VALUES('verified-phone','author','phone','+15555550123',?)").bind(NOW - 1000).run();
    const h = harness(); await begin(h, 'author-handle', 'phone');
    expect(h.sent[0]).toMatchObject({ channel: 'phone', destination: '+15555550123' });
    for (const body of [{ ...startBody(), destination: 'attacker@example.invalid' }, { ...startBody(), email: 'attacker@example.invalid' }, startBody('fictional-author@example.invalid')]) {
      expect((await post('/api/recovery/start', body, h)).status).toBe(400);
    }
    expect(h.sent).toHaveLength(1);
  });
  it('requires trusted Origin and a server-validated recovery Turnstile action before making challenges', async () => {
    const h = harness();
    expect((await post('/api/recovery/start', startBody(), h, { Origin: 'https://hostile.example' })).status).toBe(403);
    expect((await post('/api/recovery/start', { ...startBody(), turnstileToken: '' }, h)).status).toBe(403);
    h.dependencies.siteverifyFetch = async () => Response.json({ success: true, action: 'signup', hostname: 'localhost' });
    expect((await post('/api/recovery/start', startBody('second-username'), h)).status).toBe(403);
    h.dependencies.siteverifyFetch = async () => { throw new Error('provider unavailable'); };
    expect((await post('/api/recovery/start', startBody('third-username'), h)).status).toBe(503);
    expect(await env.DB.prepare('SELECT id FROM recovery_challenges').first()).toBeNull();
    expect(h.sent).toHaveLength(0);
  });
  it('returns generic acceptance while delivery is pending and a pending code cannot reset a password', async () => {
    let release!: () => void; let started!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const deliveryStarted = new Promise<void>(resolve => { started = resolve; });
    const h = harness(async () => { started(); await gate; });
    const response = await post('/api/recovery/start', startBody(), h); expect(response.status).toBe(202);
    const value = await response.json() as { challengeId: string };
    await deliveryStarted;
    expect(h.sent).toHaveLength(1);
    expect((await complete(h, value.challengeId, h.sent[0].code)).status).toBe(400);
    release(); await h.flush();
    expect(await env.DB.prepare('SELECT state FROM recovery_challenges WHERE id=?').bind(value.challengeId).first()).toEqual({ state: 'ready' });
  });
  it('provider failure keeps public behavior generic and leaves the challenge unusable', async () => {
    const h = harness(async () => { throw new Error('synthetic delivery outage'); }); const value = await begin(h);
    expect((await complete(h, value.challengeId, h.sent[0].code)).status).toBe(400);
    expect((await credential())?.password_hash).toBe('previous-password-hash');
    expect(await env.DB.prepare('SELECT state FROM recovery_challenges WHERE id=?').bind(value.challengeId).first()).toEqual({ state: 'failed' });
  });
  it('rechecks the enrolled contact before background delivery when it is revoked after the first lookup', async () => {
    const h = harness(); const db = primary(env.DB); const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, 'prepare').mockImplementation(query => {
      const statement = originalPrepare(query);
      if (query.includes('INSERT INTO recovery_challenges')) {
        const originalBind = statement.bind.bind(statement);
        vi.spyOn(statement, 'bind').mockImplementation((...values) => {
          const bound = originalBind(...values); const originalRun = bound.run.bind(bound);
          vi.spyOn(bound, 'run').mockImplementationOnce(async <T>() => {
            await env.DB.prepare("UPDATE recovery_contacts SET revoked_at=? WHERE id='verified-email'").bind(Date.now()).run();
            return originalRun<T>();
          });
          return bound;
        });
      }
      return statement;
    });
    const response = await handleRecoveryRoute(request('/api/recovery/start', startBody()), configured(), db, h.dependencies);
    expect(response?.status).toBe(202); await h.flush();
    expect(h.sent).toHaveLength(0);
    expect(await env.DB.prepare('SELECT state FROM recovery_challenges').first()).toEqual({ state: 'failed' });
  });
  it('stores only a challenge-specific HMAC, records expiry, and never stores the delivered code', async () => {
    const h = harness(); const first = await begin(h);
    expect(h.sent[0].code).toMatch(/^\d{8}$/);
    const row = await env.DB.prepare('SELECT code_hash,created_at,expires_at,attempts FROM recovery_challenges WHERE id=?').bind(first.challengeId).first<{ code_hash: string; created_at: number; expires_at: number; attempts: number }>();
    expect(row?.code_hash).toMatch(/^[a-f0-9]{64}$/); expect(row?.code_hash).not.toBe(h.sent[0].code);
    expect(row!.expires_at - row!.created_at).toBe(600000); expect(row?.attempts).toBe(0);
    expect(h.sent[0].expiresAt).toBe(row?.expires_at); expect(h.sent[0].requestId).toBe(first.challengeId);
  });
  it('changes the password using real scrypt and revokes all sessions and other outstanding challenges atomically', async () => {
    const oldOne = await session('author'); await session('author'); const h = harness(); const first = await begin(h); const second = await begin(h);
    const response = await complete(h, first.challengeId, h.sent[0].code); expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reset: true }); expect(response.headers.get('Set-Cookie')).toContain('HttpOnly; SameSite=Lax; Max-Age=0');
    const saved = await credential(); expect(saved?.version).toBe(2); expect(saved?.password_hash).toMatch(/^scrypt\$32768\$8\$3\$/);
    expect(await verifyRecoveryPassword(password, saved!.password_hash)).toBe(true);
    expect(await verifyRecoveryPassword('an incorrect long password', saved!.password_hash)).toBe(false);
    expect(await env.DB.prepare("SELECT session_epoch FROM users WHERE id='author'").first()).toEqual({ session_epoch: 1 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM sessions WHERE user_id='author' AND revoked_at IS NULL").first()).toEqual({ count: 0 });
    expect(await env.DB.prepare('SELECT state FROM recovery_challenges WHERE id=?').bind(second.challengeId).first()).toEqual({ state: 'failed' });
    expect((await complete(h, first.challengeId, h.sent[0].code)).status).toBe(400);
    const oldSession = await handleRequest(new Request(`${ORIGIN}/api/session`, { headers: oldOne.headers }), configured());
    expect(await oldSession.json()).toMatchObject({ authenticated: false });
  });
  it('allows only one concurrent valid completion of the same code', async () => {
    const h = harness(); const value = await begin(h);
    const responses = await Promise.all([complete(h, value.challengeId, h.sent[0].code), complete(h, value.challengeId, h.sent[0].code)]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
    expect((await credential())?.version).toBe(2);
    expect(await env.DB.prepare("SELECT session_epoch FROM users WHERE id='author'").first()).toEqual({ session_epoch: 1 });
  });
  it('caps guesses at five and rejects malformed or unknown challenges without consuming credentials', async () => {
    const h = harness(); const value = await begin(h); const wrong = h.sent[0].code === '00000000' ? '11111111' : '00000000';
    expect((await complete(h, value.challengeId, 'not-a-code')).status).toBe(400);
    for (let attempt = 0; attempt < 5; attempt++) expect((await complete(h, value.challengeId, wrong)).status).toBe(400);
    expect((await complete(h, value.challengeId, h.sent[0].code)).status).toBe(400);
    expect(await env.DB.prepare('SELECT attempts,state FROM recovery_challenges WHERE id=?').bind(value.challengeId).first()).toEqual({ attempts: 5, state: 'ready' });
    expect((await complete(h, crypto.randomUUID(), wrong)).status).toBe(400);
    expect((await credential())?.version).toBe(1);
  });
  it('rejects expired codes and invalid passwords without a reset', async () => {
    const h = harness(); const value = await begin(h);
    for (const invalid of ['too short', 'a'.repeat(1025)]) expect((await complete(h, value.challengeId, h.sent[0].code, invalid)).status).toBe(400);
    expect(await env.DB.prepare('SELECT attempts FROM recovery_challenges WHERE id=?').bind(value.challengeId).first()).toEqual({ attempts: 0 });
    await env.DB.prepare('UPDATE recovery_challenges SET expires_at=? WHERE id=?').bind(Date.now() - 1, value.challengeId).run();
    expect((await complete(h, value.challengeId, h.sent[0].code)).status).toBe(400);
    expect((await credential())?.version).toBe(1);
  });
  it.each(['contact-revoked', 'contact-version', 'session-epoch', 'suspended-account', 'expired-at-commit'])('rechecks %s during the atomic reset commit', async kind => {
    const h = harness(); const value = await begin(h);
    const response = await raceComplete(h, value.challengeId, h.sent[0].code, () => {
      if (kind === 'contact-revoked') return env.DB.prepare("UPDATE recovery_contacts SET revoked_at=? WHERE id='verified-email'").bind(Date.now()).run();
      if (kind === 'contact-version') return env.DB.prepare("UPDATE recovery_contacts SET version=version+1 WHERE id='verified-email'").run();
      if (kind === 'session-epoch') return env.DB.prepare("UPDATE users SET session_epoch=session_epoch+1 WHERE id='author'").run();
      if (kind === 'suspended-account') return env.DB.prepare("UPDATE users SET status='suspended' WHERE id='author'").run();
      return env.DB.prepare('UPDATE recovery_challenges SET expires_at=? WHERE id=?').bind(Date.now() - 1, value.challengeId).run();
    });
    expect(response?.status).toBe(400); expect((await credential())?.version).toBe(1);
    expect(await env.DB.prepare('SELECT consumed_at FROM recovery_challenges WHERE id=?').bind(value.challengeId).first()).toEqual({ consumed_at: null });
  });
  it('applies account and IP rate limits equally to nonexistent names without storing plaintext rate keys', async () => {
    const h = harness(); for (let index = 0; index < 3; index++) await begin(h, 'missing-user');
    expect((await post('/api/recovery/start', startBody('missing-user'), h)).status).toBe(429);
    for (let index = 0; index < 26; index++) await begin(h, `other-${index}`);
    expect((await post('/api/recovery/start', startBody('last-name'), h)).status).toBe(429);
    const keys = await env.DB.prepare('SELECT key FROM rate_buckets').all<{ key: string }>();
    expect(keys.results.every(row => !row.key.includes('missing-user') && !row.key.includes('local-unknown'))).toBe(true);
    expect(h.sent).toHaveLength(0);
  });
  it('does not let failed bot checks exhaust another account recovery allowance', async () => {
    const h = harness();
    for (let index = 0; index < 3; index++) {
      expect((await post('/api/recovery/start', { ...startBody(), turnstileToken: '' }, h)).status).toBe(403);
    }
    await begin(h);
    expect(h.sent).toHaveLength(1);
    const userBuckets = await env.DB.prepare("SELECT count FROM rate_buckets WHERE key LIKE 'recovery-user:%'").all<{ count: number }>();
    expect(userBuckets.results).toEqual([{ count: 1 }]);
    const ipBuckets = await env.DB.prepare("SELECT count FROM rate_buckets WHERE key LIKE 'recovery-ip:%'").all<{ count: number }>();
    expect(ipBuckets.results).toEqual([{ count: 4 }]);
  });
  it('hashes the entire supplied password without trimming and validates stored hash encodings safely', async () => {
    const original = ` ${password} `; const hashed = await hashRecoveryPassword(original);
    expect(await verifyRecoveryPassword(original, hashed)).toBe(true); expect(await verifyRecoveryPassword(password, hashed)).toBe(false);
    expect(await verifyRecoveryPassword(password, 'not-a-password-hash')).toBe(false);
    expect(await verifyRecoveryPassword('a'.repeat(1025), hashed)).toBe(false);
  });
});
