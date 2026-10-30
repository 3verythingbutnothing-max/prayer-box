import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { getRegistrationConfig, recoverAccount, registerAccount, RegistrationError, rotateRecoveryKit, signInAccount, signOutAccount } from './registration-client.ts';

const config = { registrationAvailable: true, signInAvailable: true, recoveryAvailable: true, teenRegistrationAvailable: false, turnstileSiteKey: 'synthetic-sitekey', csrfToken: 'a'.repeat(64) };
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => { Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } }); });
afterEach(() => { mock.restoreAll(); if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window'); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('concurrent bootstrap consumers share one request and later visits refresh CSRF', async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => { calls.push({ path, options }); return json(config); });
  const first = getRegistrationConfig(); const second = getRegistrationConfig();
  assert.equal(first, second);
  assert.deepEqual(await first, config); assert.deepEqual(await second, config); assert.equal(calls.length, 1);
  await getRegistrationConfig(); assert.equal(calls.length, 2);
  assert.equal(calls[0].path, '/api/auth/config'); assert.equal(calls[0].options?.credentials, 'same-origin');
  assert.equal(calls[0].options?.cache, 'no-store'); assert.equal(calls[0].options?.redirect, 'error'); assert.equal(calls[0].options?.body, undefined);
});

test('malformed configuration and oversized responses never enable account forms', async () => {
  for (const response of [json({ registrationAvailable: true }), new Response('x'.repeat(65_537)), new Response('<html>Not the account API</html>')]) {
    mock.method(globalThis, 'fetch', async () => response);
    await assert.rejects(getRegistrationConfig(), RegistrationError);
    mock.restoreAll();
  }
});

test('registration sends only first-party JSON with stable idempotency and CSRF headers', async () => {
  let sent: { path: string; options?: RequestInit } | undefined;
  mock.method(globalThis, 'fetch', async (path: string, options?: RequestInit) => { sent = { path, options }; return json({ registered: true, username: 'test-pilot', recoveryCodes: ['SYNTHETIC-ONLY-CODE'] }); });
  const input = { username: 'test-pilot', password: 'a fictional passphrase', ageBand: 'adult' as const, language: 'en' as const, inviteCode: 'SYNTHETIC-INVITE', turnstileToken: 'SYNTHETIC-BOT' };
  const result = await registerAccount(input, 'synthetic-csrf', 'same-attempt-key');
  assert.equal(sent?.path, '/api/auth/register'); assert.deepEqual(JSON.parse(String(sent?.options?.body)), input);
  assert.equal(new Headers(sent?.options?.headers).get('Idempotency-Key'), 'same-attempt-key');
  assert.equal(new Headers(sent?.options?.headers).get('X-CSRF-Token'), 'synthetic-csrf');
  assert.equal(sent?.options?.credentials, 'same-origin'); assert.equal(sent?.options?.redirect, 'error');
  assert.deepEqual(result.recoveryCodes, ['SYNTHETIC-ONLY-CODE']);
});

test('a completed registration replay can return no codes instead of inventing another kit', async () => {
  mock.method(globalThis, 'fetch', async () => json({ registered: true, username: 'test-pilot', recoveryCodes: [] }));
  assert.deepEqual((await registerAccount({ username: 'test-pilot', password: 'a fictional passphrase', ageBand: 'adult', language: 'en', inviteCode: 'SYNTHETIC', turnstileToken: 'SYNTHETIC' }, 'csrf', 'same-key')).recoveryCodes, []);
});

test('unexpected success payloads do not produce signed-in or recovered success', async () => {
  mock.method(globalThis, 'fetch', async () => json({ signedIn: false, reset: false, signedOut: false }));
  await assert.rejects(signInAccount({ username: 'test-pilot', password: 'a fictional passphrase', turnstileToken: 'SYNTHETIC' }, 'csrf'), RegistrationError);
  await assert.rejects(recoverAccount({ username: 'test-pilot', recoveryCode: 'SYNTHETIC', newPassword: 'a fictional passphrase', turnstileToken: 'SYNTHETIC' }, 'csrf'), RegistrationError);
  await assert.rejects(signOutAccount('csrf'), RegistrationError);
});

test('transport failures are explicit unknown outcomes and raw non-JSON errors are not shown', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new Error('Private transport internals must not be shown'); });
  await assert.rejects(signInAccount({ username: 'test-pilot', password: 'a fictional passphrase', turnstileToken: 'SYNTHETIC' }, 'csrf'), (error: unknown) => error instanceof RegistrationError && error.status === 0 && !error.message.includes('Private transport'));
  mock.restoreAll(); mock.method(globalThis, 'fetch', async () => new Response('Private gateway diagnostics', { status: 502 }));
  await assert.rejects(getRegistrationConfig(), (error: unknown) => error instanceof RegistrationError && !error.message.includes('Private gateway'));
});

test('recovery-kit replacement rejects malformed code arrays', async () => {
  for (const codes of [[null], []]) {
    mock.method(globalThis, 'fetch', async () => json({ recoveryCodes: codes }));
    await assert.rejects(rotateRecoveryKit('csrf'), RegistrationError);
    mock.restoreAll();
  }
});

test('password correction keeps the original invitation intent while identity edits require a fresh attempt', async () => {
  const { beginSignupAttempt, editSignupAttempt, emptySignupAttempt, failSignupAttempt } = await import('./registration-client.ts');
  const first = beginSignupAttempt(emptySignupAttempt(), 'first-key');
  const passwordRejected = failSignupAttempt(first, { status: 400, code: 'invalid_password' });
  assert.equal(passwordRejected.key, 'first-key'); assert.equal(passwordRejected.identityLocked, true); assert.equal(passwordRejected.allLocked, false);
  const corrected = editSignupAttempt(passwordRejected, 'password');
  assert.equal(corrected.key, 'first-key'); assert.equal(beginSignupAttempt(corrected, 'new-key').key, 'first-key');
  assert.deepEqual(editSignupAttempt(passwordRejected, 'identity'), passwordRejected);
  const rejectedBeforeIntent = failSignupAttempt(first, { status: 409, code: 'username_unavailable' });
  assert.equal(rejectedBeforeIntent.identityLocked, false); assert.equal(rejectedBeforeIntent.key, null);
  assert.equal(beginSignupAttempt(editSignupAttempt(rejectedBeforeIntent, 'identity'), 'new-key').key, 'new-key');
});

test('later verification errors cannot abandon a possibly claimed invitation or unlock an unknown outcome', async () => {
  const { beginSignupAttempt, emptySignupAttempt, failSignupAttempt } = await import('./registration-client.ts');
  const first = beginSignupAttempt(emptySignupAttempt(), 'same-key');
  for (const prior of [failSignupAttempt(first, { status: 400, code: 'invalid_password' }), failSignupAttempt(first, { status: 0 })]) {
    const later = failSignupAttempt(beginSignupAttempt(prior, 'different-key'), { status: 403, code: 'bot_verification_failed' });
    assert.equal(later.key, 'same-key'); assert.equal(later.identityLocked, true); assert.equal(later.allLocked, prior.allLocked);
  }
});

test('provider reconciliation stops cannot be unlocked by edits, verification retries or a fresh key', async () => {
  const { beginSignupAttempt, editSignupAttempt, emptySignupAttempt, failSignupAttempt } = await import('./registration-client.ts');
  for (const code of ['registration_reconciliation_required', 'recovery_reconciliation_required']) {
    const halted = failSignupAttempt(beginSignupAttempt(emptySignupAttempt(), 'original-key'), { status: 503, code });
    assert.equal(halted.halted, true); assert.equal(halted.allLocked, true); assert.equal(halted.identityLocked, true);
    assert.equal(editSignupAttempt(halted, 'password').key, 'original-key');
    assert.equal(editSignupAttempt(halted, 'identity').key, 'original-key');
    assert.equal(beginSignupAttempt(halted, 'replacement-key').key, 'original-key');
    assert.equal(failSignupAttempt(halted, { status: 403, code: 'bot_verification_failed' }).halted, true);
    assert.equal(failSignupAttempt(halted, { status: 400, code: 'invalid_password' }).allLocked, true);
  }
});

test('a corrected password reaches the same server attempt instead of claiming the invitation again', async () => {
  const { beginSignupAttempt, editSignupAttempt, emptySignupAttempt, failSignupAttempt } = await import('./registration-client.ts');
  const calls: { key: string | null; input: Record<string, unknown> }[] = [];
  mock.method(globalThis, 'fetch', async (_path: string, options: RequestInit) => {
    calls.push({ key: new Headers(options.headers).get('Idempotency-Key'), input: JSON.parse(String(options.body)) });
    return calls.length === 1 ? json({ error: { code: 'invalid_password', message: 'Choose another password.', retryable: false } }, 400) : json({ registered: true, username: 'test-pilot', recoveryCodes: [] });
  });
  const input = { username: 'test-pilot', password: 'first fictional passphrase', ageBand: 'adult' as const, language: 'en' as const, inviteCode: 'SYNTHETIC-INVITE', turnstileToken: 'SYNTHETIC-BOT' };
  let attempt = beginSignupAttempt(emptySignupAttempt(), 'original-key');
  try { await registerAccount(input, 'csrf', attempt.key!); } catch (error) { assert.ok(error instanceof RegistrationError); attempt = failSignupAttempt(attempt, error); }
  attempt = beginSignupAttempt(editSignupAttempt(attempt, 'password'), 'unused-key');
  await registerAccount({ ...input, password: 'corrected fictional passphrase' }, 'csrf', attempt.key!);
  assert.deepEqual(calls.map(call => call.key), ['original-key', 'original-key']);
  assert.equal(calls[0].input.username, calls[1].input.username); assert.equal(calls[0].input.inviteCode, calls[1].input.inviteCode);
  assert.notEqual(calls[0].input.password, calls[1].input.password);
});
