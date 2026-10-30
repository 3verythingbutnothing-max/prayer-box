import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleRequest } from '../src/index';
import type { BackendEnv } from '../src/env';
import { hashSecret, primary } from '../src/data';
import type { Database } from '../src/data';
import { errorResponse } from '../src/http';
import { handleAuthRoute } from '../src/registration';
import { CognitoError } from '../src/cognito';
import type { AuthDependencies } from '../src/registration';
import { ORIGIN, resetDatabase, seedUsers, session } from './fixtures';

const PASS = 'SyntheticPrayerPassword15!';
const NEXT_PASS = 'SyntheticReplacementPassword25!';
const inviteCode = 'synthetic-invitation-' + 'a'.repeat(40);
const configured = (overrides: Partial<BackendEnv> = {}): BackendEnv => ({
  ...env, AUTH_PROVIDER: 'cognito', AUTH_REGISTRATION_ENABLED: 'true', AUTH_SIGNIN_ENABLED: 'true', AUTH_RECOVERY_ENABLED: 'true', AUTH_TEEN_REGISTRATION_ENABLED: 'false',
  COGNITO_REGION: 'us-east-1', COGNITO_USER_POOL_ID: 'us-east-1_Test12345', COGNITO_CLIENT_ID: 'syntheticclient123',
  AWS_ACCESS_KEY_ID: 'AKIA' + 'A'.repeat(16), AWS_SECRET_ACCESS_KEY: 'a'.repeat(40), AUTH_SIGNING_SECRET: 'synthetic-signing-key-' + 'a'.repeat(48),
  TURNSTILE_SECRET: 'synthetic-turnstile-secret', TURNSTILE_SITE_KEY: 'synthetic-site-key', ...overrides,
});
type Remote = { sub: string; providerUsername: string; password: string };
function harness() {
  const remote = new Map<string, Remote>();
  const create = vi.fn(async (input: { username: string; password: string; requestId: string }) => {
    expect(await env.DB.prepare('SELECT state FROM auth_registrations WHERE id=?').bind(input.requestId).first()).toEqual({ state: 'provider_write' });
    const providerUsername = `pb-${input.requestId}`;
    if (remote.has(providerUsername)) throw new CognitoError('identity_exists');
    const identity = { sub: input.requestId, providerUsername };
    remote.set(providerUsername, { ...identity, password: input.password });
    return identity;
  });
  const authenticate = vi.fn(async (input: { providerUsername: string; password: string }) => {
    const row = remote.get(input.providerUsername);
    if (!row || row.password !== input.password) throw new CognitoError('invalid_credentials');
    return { sub: row.sub, providerUsername: row.providerUsername };
  });
  const reset = vi.fn(async (input: { providerUsername: string; expectedSub: string; password: string }) => {
    expect(await env.DB.prepare('SELECT r.state FROM auth_recovery_attempts r JOIN auth_identities i ON i.user_id=r.user_id WHERE i.provider_username=? AND i.recovery_lock=r.id').bind(input.providerUsername).first()).toEqual({ state: 'provider_write' });
    const row = remote.get(input.providerUsername);
    if (!row || row.sub !== input.expectedSub) throw new CognitoError('protocol_error');
    row.password = input.password;
  });
  const revoke = vi.fn(async (_name: string, _sub: string) => {});
  const siteverifyFetch = vi.fn(async (_url: string, init: RequestInit) => Response.json({ success: true, action: new URLSearchParams(String(init.body)).get('response'), hostname: 'localhost' }));
  const dependencies: AuthDependencies = { identity: { create, authenticate, reset, revoke }, siteverifyFetch };
  return { remote, create, authenticate, reset, revoke, siteverifyFetch, dependencies };
}
type Harness = ReturnType<typeof harness>;
type Bootstrap = { cookie: string; csrf: string };
function request(path: string, body: unknown, headers: Record<string, string> = {}, settings = configured()) {
  return new Request(`${settings.APP_ORIGIN}${path}`, { method: 'POST', headers: { Origin: settings.APP_ORIGIN, 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.17', ...headers }, body: JSON.stringify(body) });
}
async function bootstrap(h: Harness, settings = configured()): Promise<Bootstrap> {
  const response = await handleRequest(new Request(`${settings.APP_ORIGIN}/api/auth/config`, { headers: { 'CF-Connecting-IP': '192.0.2.17' } }), settings, h.dependencies);
  expect(response.status).toBe(200);
  const body = await response.json() as { csrfToken: string };
  expect(body.csrfToken).toMatch(/^[a-f0-9]{64}$/);
  return { cookie: response.headers.get('Set-Cookie')!.split(';')[0], csrf: body.csrfToken };
}
async function invite(code = inviteCode, age = 'adult') {
  await env.DB.prepare('INSERT INTO auth_invites(id,token_hash,age_band,expires_at,created_at) VALUES(?,?,?,?,?)')
    .bind(crypto.randomUUID(), await hashSecret(code), age, Date.now() + 3600_000, Date.now()).run();
}
function registerBody(name = 'new-person', code = inviteCode) { return { username: name, password: PASS, ageBand: 'adult', language: 'en', inviteCode: code, turnstileToken: 'register' }; }
const headers = (boot: Bootstrap) => ({ Cookie: boot.cookie, 'X-CSRF-Token': boot.csrf });
function post(path: string, input: unknown, h: Harness, boot: Bootstrap, extra: Record<string, string> = {}, settings = configured()) {
  return handleRequest(request(path, input, { ...headers(boot), ...extra }, settings), settings, h.dependencies);
}
async function register(h: Harness, name = 'new-person') {
  await invite(); const boot = await bootstrap(h);
  const response = await post('/api/auth/register', registerBody(name), h, boot, { 'Idempotency-Key': 'synthetic-request-key' });
  expect(response.status).toBe(201);
  const body = await response.json() as { registered: boolean; username: string; recoveryCodes: string[] };
  const identity = await env.DB.prepare('SELECT user_id,provider_username,provider_subject FROM auth_identities').first<{ user_id: string; provider_username: string; provider_subject: string }>();
  expect(identity).not.toBeNull();
  return { ...body, identity: identity!, boot };
}
async function signIn(h: Harness, name = 'new-person', password = PASS, settings = configured(), oldCookie?: string) {
  const boot = await bootstrap(h, settings);
  const response = await post('/api/auth/signin', { username: name, password, turnstileToken: 'signin' }, h, boot, oldCookie ? { Cookie: `${boot.cookie}; ${oldCookie}` } : {}, settings);
  return response;
}
async function loggedIn(h: Harness) {
  const signed = await signIn(h); expect(signed.status).toBe(200);
  const cookie = signed.headers.get('Set-Cookie')!.split(';')[0];
  const snapshot = await handleRequest(new Request(`${ORIGIN}/api/session`, { headers: { Cookie: cookie } }), configured(), h.dependencies);
  const body = await snapshot.json() as { authenticated: boolean; csrfToken: string };
  expect(body.authenticated).toBe(true);
  return { cookie, csrf: body.csrfToken };
}
async function sessionActive(h: Harness, cookie: string) {
  const response = await handleRequest(new Request(`${ORIGIN}/api/session`, { headers: { Cookie: cookie } }), configured(), h.dependencies);
  return (await response.json() as { authenticated: boolean }).authenticated;
}

async function promote(userId: string, kind: 'reviewer' | 'group admin' | 'moderator') {
  if (kind === 'reviewer') {
    await env.DB.prepare("INSERT INTO auth_staff_roles(user_id,role) VALUES(?,'reviewer')").bind(userId).run();
    return;
  }
  const group = crypto.randomUUID(); const now = Date.now();
  await env.DB.prepare("INSERT INTO boxes(id,kind,owner_id,slug,display_name,visibility,created_at) VALUES(?,'organization',?,?,'Synthetic group','private',?)").bind(group, userId, `group-${group}`, now).run();
  await env.DB.prepare("INSERT INTO memberships(box_id,user_id,status,role,approved_by,approved_at,is_admin,is_moderator) VALUES(?,?,'approved','member',?,?,?,?)").bind(group, userId, userId, now, kind === 'group admin' ? 1 : 0, kind === 'moderator' ? 1 : 0).run();
}

beforeEach(resetDatabase);

describe('invited Cognito-backed registration and app sessions', () => {
  it('default-closed capabilities neither issue bootstrap cookies nor call identity or bot providers', async () => {
    const h = harness();
    const config = await handleRequest(new Request(`${ORIGIN}/api/auth/config`), env, h.dependencies);
    expect(await config.json()).toMatchObject({ registrationAvailable: false, signInAvailable: false, recoveryAvailable: false, csrfToken: null });
    expect(config.headers.has('Set-Cookie')).toBe(false);
    const response = await handleRequest(request('/api/auth/register', registerBody()), env, h.dependencies);
    expect(response.status).toBe(503); expect(h.create).not.toHaveBeenCalled(); expect(h.siteverifyFetch).not.toHaveBeenCalled();
    expect(await env.DB.prepare('SELECT id FROM auth_registrations').first()).toBeNull();
  });
  it('rejects nonlocal HTTP authentication configuration without credentials or cookies', async () => {
    const h = harness(); const settings = configured({ APP_ENV: 'staging', APP_ORIGIN: 'http://accounts.example.invalid' });
    const response = await handleRequest(new Request(`${settings.APP_ORIGIN}/api/auth/config`), settings, h.dependencies);
    expect(response.status).toBeGreaterThanOrEqual(400); expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(h.create).not.toHaveBeenCalled(); expect(h.authenticate).not.toHaveBeenCalled(); expect(h.siteverifyFetch).not.toHaveBeenCalled();
  });
  it('creates an invited private account and box, stores no password authority, and returns a one-time kit only once', async () => {
    const h = harness(); const created = await register(h, 'New-Person');
    expect(created.username).toBe('new-person'); expect(created.recoveryCodes).toHaveLength(8);
    expect(created.recoveryCodes.every(code => /^pbk1-[a-f0-9]{32}$/.test(code))).toBe(true);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.create.mock.calls[0][0].requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(h.create.mock.calls[0][0].requestId).not.toBe('synthetic-request-key');
    expect(await env.DB.prepare('SELECT username,visibility,status FROM users').first()).toEqual({ username: 'new-person', visibility: 'private', status: 'active' });
    expect(await env.DB.prepare('SELECT kind,visibility,owner_id FROM boxes').first()).toEqual({ kind: 'personal', visibility: 'private', owner_id: created.identity.user_id });
    expect(await env.DB.prepare('SELECT * FROM account_credentials').first()).toBeNull();
    expect(await env.DB.prepare('SELECT * FROM sessions').first()).toBeNull();
    const stored = await env.DB.prepare('SELECT * FROM auth_recovery_codes').all();
    expect(stored.results).toHaveLength(8);
    expect(stored.results.every(row => /^[a-f0-9]{64}$/.test(String(row.code_hash)))).toBe(true);
    expect(JSON.stringify(stored.results)).not.toContain(created.recoveryCodes[0]);
    const intent = await env.DB.prepare('SELECT * FROM auth_registrations').first();
    expect(JSON.stringify(intent)).not.toContain(PASS);
    const repeated = await post('/api/auth/register', registerBody('NEW-PERSON'), h, created.boot, { 'Idempotency-Key': 'synthetic-request-key' });
    expect(repeated.status).toBe(200); expect(await repeated.json()).toMatchObject({ registered: true, recoveryCodes: [] });
    expect(h.create).toHaveBeenCalledTimes(1);
  });
  it('requires exact origin, signed bootstrap, CSRF and affirmative bot verdict before reserving or provisioning', async () => {
    const h = harness(); await invite(); const boot = await bootstrap(h);
    for (const changed of [{ Origin: 'https://evil.invalid' }, { 'X-CSRF-Token': '0'.repeat(64) }, { Cookie: `${boot.cookie}; ${boot.cookie}` }] as Record<string, string>[]) {
      const response = await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1', ...changed });
      expect(response.status).toBe(403);
    }
    h.siteverifyFetch.mockImplementationOnce(async () => Response.json({ success: false, action: 'register', hostname: 'localhost' }));
    expect((await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' })).status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
    expect(await env.DB.prepare('SELECT claim_id FROM auth_invites').first()).toEqual({ claim_id: null });
    expect(await env.DB.prepare('SELECT id FROM auth_registrations').first()).toBeNull();
  });
  it('keeps minors closed and validates password, language and extra privilege fields on the server', async () => {
    const h = harness(); const boot = await bootstrap(h);
    const attempts = [
      { ...registerBody(), ageBand: 'teen' }, { ...registerBody(), ageBand: 'under13' },
      { ...registerBody(), password: 'too-short' }, { ...registerBody(), password: ' A long phrase with spaces' },
      { ...registerBody(), language: 'es' }, { ...registerBody(), role: 'admin' },
    ];
    for (const body of attempts) {
      const response = await post('/api/auth/register', body, h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
      expect([400, 403]).toContain(response.status);
    }
    expect(h.create).not.toHaveBeenCalled(); expect(h.siteverifyFetch).not.toHaveBeenCalled();
    expect(await env.DB.prepare('SELECT id FROM users').first()).toBeNull();
  });
  it('rechecks invitation revocation after provider work and publishes no partial app records', async () => {
    const h = harness(); await invite(); const boot = await bootstrap(h);
    h.create.mockImplementationOnce(async input => {
      await env.DB.prepare('UPDATE auth_invites SET revoked_at=?').bind(Date.now()).run();
      return { sub: input.requestId, providerUsername: `pb-${input.requestId}` };
    });
    const response = await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(response.status).toBe(409);
    expect(await env.DB.prepare('SELECT id FROM users').first()).toBeNull();
    expect(await env.DB.prepare('SELECT id FROM boxes').first()).toBeNull();
    expect(await env.DB.prepare('SELECT user_id FROM auth_identities').first()).toBeNull();
    expect(await env.DB.prepare('SELECT id FROM auth_recovery_codes').first()).toBeNull();
    expect(await env.DB.prepare('SELECT state,lease_token FROM auth_registrations').first()).toEqual({ state: 'pending', lease_token: null });
  });
  it('does not double-provision a contested invitation or a case-insensitive username', async () => {
    const h = harness(); const boot = await bootstrap(h); await invite();
    const responses = await Promise.all([
      post('/api/auth/register', registerBody('first-person'), h, boot, { 'Idempotency-Key': 'synthetic-key-1' }),
      post('/api/auth/register', registerBody('second-person'), h, boot, { 'Idempotency-Key': 'synthetic-key-2' }),
    ]);
    expect(responses.filter(row => row.status === 201)).toHaveLength(1);
    expect(responses.every(row => [201, 400, 409].includes(row.status))).toBe(true);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect((await env.DB.prepare('SELECT id FROM users').all()).results).toHaveLength(1);
  });
  it('resumes password-policy correction with the same private intent without storing a password fingerprint', async () => {
    const h = harness(); await invite(); const boot = await bootstrap(h);
    h.create.mockRejectedValueOnce(new CognitoError('invalid_password'));
    const first = await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(first.status).toBe(400);
    const pending = await env.DB.prepare('SELECT id,state FROM auth_registrations').first<{ id: string; state: string }>();
    expect(pending?.state).toBe('pending');
    const corrected = await post('/api/auth/register', { ...registerBody(), password: 'An internal space phrase 25!' }, h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(corrected.status).toBe(201);
    expect(h.create.mock.calls[1][0]).toMatchObject({ requestId: pending!.id, password: 'An internal space phrase 25!' });
    expect((await env.DB.prepare('SELECT id FROM auth_registrations').all()).results).toHaveLength(1);
    expect(await env.DB.prepare('SELECT * FROM account_credentials').first()).toBeNull();
  });
  it.each(['before retry', 'after retry'])('holds an ambiguous registration for reconciliation even when its original provider mutation arrives %s', async when => {
    const h = harness(); await invite(); const boot = await bootstrap(h);
    let lateApply!: () => void; let opaqueName = '';
    h.create.mockImplementationOnce(async input => {
      opaqueName = `pb-${input.requestId}`;
      lateApply = () => h.remote.set(opaqueName, { sub: input.requestId, providerUsername: opaqueName, password: input.password });
      throw new CognitoError('unavailable');
    });
    const first = await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(first.status).toBe(503);
    expect(await env.DB.prepare('SELECT state FROM auth_registrations').first()).toEqual({ state: 'reconcile' });
    if (when === 'before retry') lateApply();
    const retried = await post('/api/auth/register', { ...registerBody(), password: NEXT_PASS }, h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(retried.status).toBe(503); expect(await retried.json()).toMatchObject({ error: { code: 'registration_reconciliation_required' } });
    const changed = await post('/api/auth/register', registerBody('another-person'), h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(changed.status).toBe(409);
    const freshKey = await post('/api/auth/register', registerBody('another-person'), h, boot, { 'Idempotency-Key': 'synthetic-key-2' });
    expect(freshKey.status).toBe(400);
    if (when === 'after retry') lateApply();
    expect(h.create).toHaveBeenCalledTimes(1); expect(h.authenticate).not.toHaveBeenCalled();
    expect(h.remote.get(opaqueName)?.password).toBe(PASS);
    expect(await env.DB.prepare('SELECT id FROM users').first()).toBeNull();
    expect(await env.DB.prepare('SELECT id FROM auth_recovery_codes').first()).toBeNull();
    const stored = JSON.stringify((await env.DB.prepare('SELECT * FROM auth_registrations').all()).results);
    expect(stored).not.toContain(PASS); expect(stored).not.toContain(NEXT_PASS);
  });
  it.each([true, false])('never retries a crashed registration provider_write phase (active lease: %s)', async active => {
    const h = harness(); await invite(); const boot = await bootstrap(h);
    h.create.mockRejectedValueOnce(new CognitoError('invalid_password'));
    expect((await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' })).status).toBe(400);
    await env.DB.prepare("UPDATE auth_registrations SET state='provider_write',lease_token='crashed-operation',lease_until=?").bind(Date.now() + (active ? 60_000 : -1000)).run();
    const response = await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(response.status).toBe(active ? 409 : 503);
    expect(await response.json()).toMatchObject({ error: { code: active ? 'registration_pending' : 'registration_reconciliation_required' } });
    expect(h.create).toHaveBeenCalledTimes(1); expect(h.authenticate).not.toHaveBeenCalled();
    expect(await env.DB.prepare('SELECT state FROM auth_registrations').first()).toEqual({ state: 'provider_write' });
    expect(await env.DB.prepare('SELECT id FROM users').first()).toBeNull();
  });
  it('resumes a provider-confirmed account after an interrupted app commit only by verifying its existing password', async () => {
    const h = harness(); await invite(); const boot = await bootstrap(h);
    const create = h.create.getMockImplementation()!;
    h.create.mockImplementationOnce(async input => {
      const result = await create(input);
      await env.DB.prepare('UPDATE auth_invites SET revoked_at=?').bind(Date.now()).run();
      return result;
    });
    expect((await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' })).status).toBe(409);
    expect(h.remote.size).toBe(1); expect(await env.DB.prepare('SELECT id FROM users').first()).toBeNull();
    await env.DB.prepare('UPDATE auth_invites SET revoked_at=NULL').run();
    const resumed = await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-key-1' });
    expect(resumed.status).toBe(201); expect(h.remote.size).toBe(1); expect(h.authenticate).toHaveBeenCalledTimes(1);
    expect((await env.DB.prepare('SELECT id FROM users').all()).results).toHaveLength(1);
  });
  it('serializes case-insensitive usernames across separate invitations and rolls back the losing invite claim', async () => {
    const h = harness(); const boot = await bootstrap(h); const other = 'synthetic-other-invitation-' + 'b'.repeat(40); await invite(); await invite(other);
    const results = await Promise.all([
      post('/api/auth/register', registerBody('Shared-Name'), h, boot, { 'Idempotency-Key': 'synthetic-key-1' }),
      post('/api/auth/register', registerBody('SHARED-NAME', other), h, boot, { 'Idempotency-Key': 'synthetic-key-2' }),
    ]);
    expect(results.map(row => row.status).sort()).toEqual([201, 409]); expect(h.create).toHaveBeenCalledTimes(1);
    const invites = (await env.DB.prepare('SELECT claim_id,used_at FROM auth_invites').all()).results;
    expect(invites.filter(row => row.claim_id === null && row.used_at === null)).toHaveLength(1);
    expect((await env.DB.prepare('SELECT id FROM users').all()).results).toHaveLength(1);
  });
  it('issues a fresh secure HttpOnly cookie and revokes the browser’s previous session on sign-in', async () => {
    const h = harness(); await register(h);
    const settings = configured({ APP_ORIGIN: 'https://localhost:8787' });
    const first = await signIn(h, 'NEW-PERSON', PASS, settings);
    expect(first.status).toBe(200);
    const original = first.headers.get('Set-Cookie')!;
    expect(original).toContain('__Host-pb_session='); expect(original).toContain('; Secure'); expect(original).toContain('; HttpOnly'); expect(original).toContain('; SameSite=Lax'); expect(original).not.toContain('Domain=');
    const second = await signIn(h, 'new-person', PASS, settings, original.split(';')[0]);
    expect(second.status).toBe(200); expect(second.headers.get('Set-Cookie')).not.toBe(original);
    const stored = (await env.DB.prepare('SELECT token_hash,csrf_hash,revoked_at FROM sessions ORDER BY created_at,id').all()).results;
    expect(stored).toHaveLength(2); expect(stored.filter(row => row.revoked_at !== null)).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(original.split('=')[1].split(';')[0]);
  });
  it('rejects foreign subjects, foreign pools, disabled accounts, and privileged sign-in without MFA', async () => {
    const h = harness(); const created = await register(h);
    h.authenticate.mockResolvedValueOnce({ sub: crypto.randomUUID(), providerUsername: created.identity.provider_username });
    expect((await signIn(h)).status).toBe(401);
    expect((await signIn(h, 'new-person', PASS, configured({ COGNITO_USER_POOL_ID: 'us-east-1_OtherPool' }))).status).toBe(401);
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id=?").bind(created.identity.user_id).run();
    expect((await signIn(h)).status).toBe(401);
    await env.DB.prepare("UPDATE users SET status='active' WHERE id=?").bind(created.identity.user_id).run();
    await env.DB.prepare("INSERT INTO auth_staff_roles(user_id,role) VALUES(?,'reviewer')").bind(created.identity.user_id).run();
    const staff = await signIn(h); expect(staff.status).toBe(403); expect(await staff.json()).toMatchObject({ error: { code: 'mfa_required' } });
    expect(await env.DB.prepare('SELECT id FROM sessions').first()).toBeNull();
  });
  it('rechecks a newly granted staff role in the session-creation batch', async () => {
    const h = harness(); const created = await register(h); const boot = await bootstrap(h);
    const db = primary(env.DB);
    const racing: Database = { prepare: db.prepare.bind(db), batch: async statements => {
      await env.DB.prepare("INSERT INTO auth_staff_roles(user_id,role) VALUES(?,'admin')").bind(created.identity.user_id).run();
      return db.batch(statements);
    } };
    let response: Response;
    try { response = (await handleAuthRoute(request('/api/auth/signin', { username: 'new-person', password: PASS, turnstileToken: 'signin' }, headers(boot)), configured(), racing, h.dependencies))!; }
    catch (error) { response = errorResponse(error); }
    expect(response.status).toBe(401); expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(await env.DB.prepare('SELECT id FROM sessions').first()).toBeNull();
  });
  it.each(['reviewer', 'group admin', 'moderator'] as const)('denies an existing basic session and kit rotation after promotion to %s', async kind => {
    const h = harness(); const created = await register(h); const auth = await loggedIn(h);
    await promote(created.identity.user_id, kind);
    expect(await sessionActive(h, auth.cookie)).toBe(false);
    const rotate = await handleRequest(request('/api/auth/recovery-kit/rotate', {}, headers(auth)), configured(), h.dependencies);
    expect(rotate.status).toBe(401);
    expect((await env.DB.prepare("SELECT id FROM auth_recovery_codes WHERE state='available'").all()).results).toHaveLength(8);
    expect((await env.DB.prepare('SELECT id FROM auth_recovery_codes').all()).results).toHaveLength(8);
  });
  it('bounds failed username attempts before another password-provider call', async () => {
    const h = harness(); const boot = await bootstrap(h);
    for (let index = 0; index < 10; index++) expect((await post('/api/auth/signin', { username: 'unknown-person', password: PASS, turnstileToken: 'signin' }, h, boot)).status).toBe(401);
    const denied = await post('/api/auth/signin', { username: 'unknown-person', password: PASS, turnstileToken: 'signin' }, h, boot);
    expect(denied.status).toBe(429); expect(denied.headers.get('Retry-After')).toBe('900'); expect(h.authenticate).toHaveBeenCalledTimes(10);
  });
});

describe('contact-free recovery and kit rotation', () => {
  it('rotates codes only with recent authenticated same-origin CSRF and invalidates the old kit', async () => {
    const h = harness(); const created = await register(h); const auth = await loggedIn(h);
    const rotated = await handleRequest(request('/api/auth/recovery-kit/rotate', {}, headers(auth)), configured(), h.dependencies);
    expect(rotated.status).toBe(200); const body = await rotated.json() as { recoveryCodes: string[] }; expect(body.recoveryCodes).toHaveLength(8);
    expect(body.recoveryCodes).not.toContain(created.recoveryCodes[0]);
    const states = (await env.DB.prepare('SELECT state,COUNT(*) AS count FROM auth_recovery_codes GROUP BY state').all()).results;
    expect(states).toEqual(expect.arrayContaining([{ state: 'available', count: 8 }, { state: 'revoked', count: 8 }]));
    const old = await post('/api/auth/recover', { username: 'new-person', recoveryCode: created.recoveryCodes[0], newPassword: NEXT_PASS, turnstileToken: 'recover' }, h, await bootstrap(h));
    expect(old.status).toBe(400); expect(h.reset).not.toHaveBeenCalled();
    await env.DB.prepare('UPDATE sessions SET authenticated_at=?').bind(Date.now() - 301_000).run();
    const stale = await handleRequest(request('/api/auth/recovery-kit/rotate', {}, headers(auth)), configured(), h.dependencies);
    expect(stale.status).toBe(403); expect(await stale.json()).toMatchObject({ error: { code: 'recent_signin_required' } });
    expect((await env.DB.prepare("SELECT id FROM auth_recovery_codes WHERE state='available'").all()).results).toHaveLength(8);
  });
  it.each(['reviewer', 'moderator'] as const)('rechecks promotion to %s in the final kit-rotation batch', async kind => {
    const h = harness(); const created = await register(h); const auth = await loggedIn(h); const db = primary(env.DB);
    const racing: Database = { prepare: db.prepare.bind(db), batch: async statements => {
      await promote(created.identity.user_id, kind);
      return db.batch(statements);
    } };
    let response: Response;
    try { response = (await handleAuthRoute(request('/api/auth/recovery-kit/rotate', {}, headers(auth)), configured(), racing, h.dependencies))!; }
    catch (error) { response = errorResponse(error); }
    expect(response.status).toBe(401);
    expect((await env.DB.prepare("SELECT id FROM auth_recovery_codes WHERE state='available'").all()).results).toHaveLength(8);
    expect((await env.DB.prepare('SELECT id FROM auth_recovery_codes').all()).results).toHaveLength(8);
  });
  it('limits kit replacement to three attempts per user per fifteen-minute window', async () => {
    const h = harness(); await register(h); const auth = await loggedIn(h);
    for (let index = 0; index < 3; index++) {
      const response = await handleRequest(request('/api/auth/recovery-kit/rotate', {}, headers(auth)), configured(), h.dependencies);
      expect(response.status).toBe(200);
    }
    const denied = await handleRequest(request('/api/auth/recovery-kit/rotate', {}, headers(auth)), configured(), h.dependencies);
    expect(denied.status).toBe(429); expect(denied.headers.get('Retry-After')).toBe('900');
    expect((await env.DB.prepare('SELECT id FROM auth_recovery_codes').all()).results).toHaveLength(32);
    expect((await env.DB.prepare("SELECT id FROM auth_recovery_codes WHERE state='available'").all()).results).toHaveLength(8);
  });
  it('requires an empty bounded JSON object before rotating a kit', async () => {
    const h = harness(); await register(h); const auth = await loggedIn(h);
    for (const body of [{ unexpected: true }, [], null, 'text']) {
      const response = await handleRequest(request('/api/auth/recovery-kit/rotate', body, headers(auth)), configured(), h.dependencies);
      expect(response.status).toBe(400);
    }
    const oversized = await handleRequest(request('/api/auth/recovery-kit/rotate', { padding: 'x'.repeat(1025) }, headers(auth)), configured(), h.dependencies);
    expect(oversized.status).toBe(413);
    const plain = await handleRequest(new Request(`${ORIGIN}/api/auth/recovery-kit/rotate`, { method: 'POST', headers: { ...headers(auth), Origin: ORIGIN, 'Content-Type': 'text/plain' }, body: '{}' }), configured(), h.dependencies);
    expect(plain.status).toBe(415);
    expect((await env.DB.prepare('SELECT id FROM auth_recovery_codes').all()).results).toHaveLength(8);
    expect(await env.DB.prepare("SELECT key FROM rate_buckets WHERE key LIKE 'auth:rotate-kit:%'").first()).toBeNull();
  });
  it('requires both sign-in and recovery capabilities to replace a kit', async () => {
    const h = harness(); await register(h); const auth = await loggedIn(h);
    for (const disabled of [{ AUTH_SIGNIN_ENABLED: 'false' }, { AUTH_RECOVERY_ENABLED: 'false' }]) {
      const response = await handleRequest(request('/api/auth/recovery-kit/rotate', {}, headers(auth)), configured(disabled), h.dependencies);
      expect(response.status).toBe(503);
    }
    expect((await env.DB.prepare('SELECT id FROM auth_recovery_codes').all()).results).toHaveLength(8);
  });
  it('preserves high-entropy kit and registration continuity after signing-secret rotation', async () => {
    const h = harness(); const created = await register(h);
    const changed = configured({ AUTH_SIGNING_SECRET: 'replacement-synthetic-key-' + 'z'.repeat(48) });
    const boot = await bootstrap(h, changed);
    const replayed = await post('/api/auth/register', registerBody(), h, boot, { 'Idempotency-Key': 'synthetic-request-key' }, changed);
    expect(replayed.status).toBe(200); expect(await replayed.json()).toMatchObject({ registered: true, recoveryCodes: [] });
    expect(h.create).toHaveBeenCalledTimes(1);
    const recovered = await post('/api/auth/recover', { username: 'new-person', recoveryCode: created.recoveryCodes[0], newPassword: NEXT_PASS, turnstileToken: 'recover' }, h, boot, {}, changed);
    expect(recovered.status).toBe(200); expect(await recovered.json()).toMatchObject({ reset: true });
    expect(h.reset).toHaveBeenCalledTimes(1); expect(h.revoke).toHaveBeenCalledTimes(1);
    expect(h.remote.get(created.identity.provider_username)?.password).toBe(NEXT_PASS);
  });
  it('resets only the mapped provider subject, revokes sessions, consumes the kit and requires fresh sign-in', async () => {
    const h = harness(); const created = await register(h); const auth = await loggedIn(h); const boot = await bootstrap(h);
    const response = await post('/api/auth/recover', { username: 'new-person', recoveryCode: created.recoveryCodes[0], newPassword: NEXT_PASS, turnstileToken: 'recover' }, h, boot);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ reset: true }); expect(response.headers.has('Set-Cookie')).toBe(false);
    expect(h.reset).toHaveBeenCalledWith({ providerUsername: created.identity.provider_username, expectedSub: created.identity.provider_subject, password: NEXT_PASS });
    expect(h.revoke).toHaveBeenCalledWith(created.identity.provider_username, created.identity.provider_subject);
    expect(h.reset.mock.invocationCallOrder[0]).toBeLessThan(h.revoke.mock.invocationCallOrder[0]);
    expect(await sessionActive(h, auth.cookie)).toBe(false);
    expect(await env.DB.prepare('SELECT session_epoch FROM users').first()).toEqual({ session_epoch: 1 });
    expect(await env.DB.prepare('SELECT recovery_lock FROM auth_identities').first()).toEqual({ recovery_lock: null });
    expect((await env.DB.prepare("SELECT id FROM auth_recovery_codes WHERE state='available'").all()).results).toHaveLength(0);
    const repeated = await post('/api/auth/recover', { username: 'new-person', recoveryCode: created.recoveryCodes[0], newPassword: PASS, turnstileToken: 'recover' }, h, boot);
    expect(repeated.status).toBe(400); expect(h.reset).toHaveBeenCalledTimes(1);
    expect((await signIn(h, 'new-person', PASS)).status).toBe(401); expect((await signIn(h, 'new-person', NEXT_PASS)).status).toBe(200);
  });
  it.each(['reset', 'revoke'] as const)('locks an ambiguous recovery %s for reconciliation and never starts another password mutation', async failedStep => {
    const h = harness(); const created = await register(h); const auth = await loggedIn(h); const boot = await bootstrap(h);
    let lateReset: (() => void) | undefined;
    if (failedStep === 'reset') h.reset.mockImplementationOnce(async input => {
      lateReset = () => { h.remote.get(input.providerUsername)!.password = input.password; };
      throw new CognitoError('unavailable');
    });
    else h.revoke.mockRejectedValueOnce(new CognitoError('unavailable'));
    const input = { username: 'new-person', recoveryCode: created.recoveryCodes[0], newPassword: NEXT_PASS, turnstileToken: 'recover' };
    expect((await post('/api/auth/recover', input, h, boot)).status).toBe(503);
    expect(await sessionActive(h, auth.cookie)).toBe(false);
    expect(await env.DB.prepare('SELECT recovery_lock FROM auth_identities').first()).toEqual({ recovery_lock: expect.any(String) });
    expect(await env.DB.prepare('SELECT state FROM auth_recovery_attempts').first()).toEqual({ state: 'reconcile' });
    expect((await env.DB.prepare("SELECT state FROM auth_recovery_codes WHERE state='reserved'").all()).results).toHaveLength(1);
    const retry = await post('/api/auth/recover', { ...input, newPassword: 'AnotherDifferentSyntheticPass99!' }, h, boot);
    expect(retry.status).toBe(503); expect(await retry.json()).toMatchObject({ error: { code: 'recovery_reconciliation_required' } });
    const anotherCode = await post('/api/auth/recover', { ...input, recoveryCode: created.recoveryCodes[1], newPassword: 'AnotherDifferentSyntheticPass99!' }, h, boot);
    expect(anotherCode.status).toBe(400);
    lateReset?.();
    expect(h.remote.get(created.identity.provider_username)?.password).toBe(NEXT_PASS);
    expect(h.reset).toHaveBeenCalledTimes(1); expect(h.revoke).toHaveBeenCalledTimes(failedStep === 'reset' ? 0 : 1);
    expect(await env.DB.prepare('SELECT session_epoch FROM users').first()).toEqual({ session_epoch: 1 });
    expect((await signIn(h, 'new-person', NEXT_PASS)).status).toBe(401);
    expect((await env.DB.prepare('SELECT id FROM auth_recovery_attempts').all()).results).toHaveLength(1);
    expect(await env.DB.prepare('SELECT recovery_lock FROM auth_identities').first()).toEqual({ recovery_lock: expect.any(String) });
  });
  it.each([true, false])('never retries a crashed recovery provider_write phase (active lease: %s)', async active => {
    const h = harness(); const created = await register(h); const auth = await loggedIn(h); const boot = await bootstrap(h);
    h.reset.mockRejectedValueOnce(new CognitoError('invalid_password'));
    const input = { username: 'new-person', recoveryCode: created.recoveryCodes[0], newPassword: NEXT_PASS, turnstileToken: 'recover' };
    expect((await post('/api/auth/recover', input, h, boot)).status).toBe(400);
    await env.DB.prepare("UPDATE auth_recovery_attempts SET state='provider_write',lease_token='crashed-operation',lease_until=?").bind(Date.now() + (active ? 60_000 : -1000)).run();
    const response = await post('/api/auth/recover', input, h, boot);
    expect(response.status).toBe(active ? 409 : 503);
    expect(await response.json()).toMatchObject({ error: { code: active ? 'recovery_pending' : 'recovery_reconciliation_required' } });
    expect(h.reset).toHaveBeenCalledTimes(1); expect(h.revoke).not.toHaveBeenCalled();
    expect(await env.DB.prepare('SELECT state FROM auth_recovery_attempts').first()).toEqual({ state: 'provider_write' });
    expect(await sessionActive(h, auth.cookie)).toBe(false);
    expect(await env.DB.prepare('SELECT recovery_lock FROM auth_identities').first()).toEqual({ recovery_lock: expect.any(String) });
  });
  it('allows the same reserved recovery code to correct a definitive password-policy rejection', async () => {
    const h = harness(); const created = await register(h); const boot = await bootstrap(h);
    h.reset.mockRejectedValueOnce(new CognitoError('invalid_password'));
    const input = { username: 'new-person', recoveryCode: created.recoveryCodes[0], newPassword: NEXT_PASS, turnstileToken: 'recover' };
    expect((await post('/api/auth/recover', input, h, boot)).status).toBe(400);
    expect(await env.DB.prepare('SELECT state FROM auth_recovery_attempts').first()).toEqual({ state: 'pending' });
    expect(h.revoke).not.toHaveBeenCalled();
    const corrected = await post('/api/auth/recover', { ...input, newPassword: 'A corrected internal phrase 15!' }, h, boot);
    expect(corrected.status).toBe(200); expect(h.reset).toHaveBeenCalledTimes(2); expect(h.revoke).toHaveBeenCalledTimes(1);
    expect(await env.DB.prepare('SELECT session_epoch FROM users').first()).toEqual({ session_epoch: 1 });
    expect(await env.DB.prepare('SELECT recovery_lock FROM auth_identities').first()).toEqual({ recovery_lock: null });
    expect(h.remote.get(created.identity.provider_username)?.password).toBe('A corrected internal phrase 15!');
  });
  it('blocks legacy credentials/recovery and unmapped legacy sessions when Cognito is selected', async () => {
    const h = harness(); await seedUsers(); const legacy = await session('author');
    expect(await sessionActive(h, legacy.headers.Cookie)).toBe(false);
    const response = await handleRequest(request('/api/recovery/start', { username: 'author-handle', channel: 'email', turnstileToken: 'recovery' }), configured(), h.dependencies);
    expect(response.status).toBe(503); expect(h.reset).not.toHaveBeenCalled(); expect(h.siteverifyFetch).not.toHaveBeenCalled();
  });
});
