import { createHash, createHmac } from 'node:crypto';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { authenticateCognito, cognitoConfigured, createCognitoIdentity, deleteCognitoOrphan, resetCognitoPassword, revokeCognitoSessions, validateCognitoPassword } from '../src/cognito';
import type { CognitoEnvironment } from '../src/cognito';

const intent = '10000000-0000-4000-8000-000000000001';
const sub = '20000000-0000-4000-8000-000000000002';
const username = `pb-${intent}`;
const password = 'fictional-password-123';
function settings(overrides: Partial<CognitoEnvironment> = {}): CognitoEnvironment {
  return { ...env, COGNITO_REGION: 'us-east-1', COGNITO_USER_POOL_ID: 'us-east-1_TESTPOOL', COGNITO_CLIENT_ID: 'client123',
    AWS_ACCESS_KEY_ID: 'AKIAEXAMPLE0000000000', AWS_SECRET_ACCESS_KEY: 'fictionalSecretKey0123456789012345678901234', ...overrides };
}
function user(status = 'FORCE_CHANGE_PASSWORD', extra: { Name: string; Value: string }[] = []) {
  return { Username: username, Enabled: true, UserStatus: status, Attributes: [{ Name: 'sub', Value: sub }, ...extra] };
}
function existing(status = 'FORCE_CHANGE_PASSWORD', extra: { Name: string; Value: string }[] = []) {
  const { Attributes, ...rest } = user(status, extra); return { ...rest, UserAttributes: Attributes };
}
type Call = { url: string; init: RequestInit; operation: string; body: Record<string, unknown>; headers: Headers };
type Step = Record<string, unknown> | Response | Error | ((call: Call) => Response | Promise<Response>);
function script(...steps: Step[]) {
  const calls: Call[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    const call = { url, init, headers, operation: headers.get('x-amz-target')!.split('.').at(-1)!, body: JSON.parse(String(init.body)) as Record<string, unknown> };
    calls.push(call);
    const next = steps[calls.length - 1];
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(call);
    if (next instanceof Response) return next;
    if (!next) throw new Error('Unexpected provider call');
    return Response.json(next);
  });
  return { calls, fetcher };
}
const exists = () => Response.json({ __type: 'UsernameExistsException', message: 'Private provider detail' }, { status: 400 });

describe('Cognito credential authority adapter', () => {
  it.each([
    { COGNITO_REGION: undefined }, { COGNITO_REGION: 'us-east-1.attacker.invalid' }, { COGNITO_REGION: 'cn-north-1' },
    { COGNITO_REGION: 'us-gov-west-1' }, { COGNITO_USER_POOL_ID: 'eu-west-1_OTHER' }, { COGNITO_CLIENT_ID: 'url/escape' },
    { AWS_ACCESS_KEY_ID: undefined }, { AWS_SECRET_ACCESS_KEY: undefined }, { AWS_SESSION_TOKEN: 'token\nunsafe' },
  ])('fails closed on missing/unsafe configuration without any provider call (%j)', async overrides => {
    const value = settings(overrides); const fetcher = vi.fn();
    expect(cognitoConfigured(value)).toBe(false);
    await expect(createCognitoIdentity(value, { username: 'elena', password, requestId: intent }, fetcher)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('creates a private native identity, suppresses messages, then sets permanent credentials by immutable sub', async () => {
    const { fetcher, calls } = script({ User: user() }, {});
    const result = await createCognitoIdentity(settings(), { username: 'elena', password, requestId: intent }, fetcher);
    expect(result).toEqual({ sub, providerUsername: username });
    expect(calls.map(call => call.operation)).toEqual(['AdminCreateUser', 'AdminSetUserPassword']);
    expect(calls[0].body).toMatchObject({ UserPoolId: 'us-east-1_TESTPOOL', Username: username, MessageAction: 'SUPPRESS', UserAttributes: [] });
    expect(calls[0].body.TemporaryPassword).not.toBe(password);
    expect(calls[0].body.TemporaryPassword).toMatch(/^Aa1![a-f0-9]{64}$/);
    expect(JSON.stringify(calls[0].body)).not.toContain('elena');
    expect(calls[1].body).toMatchObject({ Username: sub, Password: password, Permanent: true });
    expect(JSON.stringify(result)).not.toMatch(/password|token|secret/i);
  });

  it('signs the exact fixed-host payload correctly, including temporary session credentials', async () => {
    const value = settings({ AWS_SESSION_TOKEN: 'synthetic-session-token' });
    const { fetcher, calls } = script({ User: user() }, {});
    await createCognitoIdentity(value, { username: 'elena', password, requestId: intent }, fetcher);
    const { url, init, headers } = calls[0];
    expect(url).toBe('https://cognito-idp.us-east-1.amazonaws.com/');
    expect(init.method).toBe('POST'); expect(init.redirect).toBe('error');
    expect(headers.get('x-amz-security-token')).toBe('synthetic-session-token');
    const authorization = headers.get('authorization')!;
    const match = authorization.match(/^AWS4-HMAC-SHA256 Credential=([^/]+)\/([^,]+), SignedHeaders=([^,]+), Signature=([a-f0-9]{64})$/)!;
    expect(match).not.toBeNull();
    const date = headers.get('x-amz-date')!;
    const names = match[3].split(';');
    expect(names).toEqual(['content-type', 'host', 'x-amz-date', 'x-amz-security-token', 'x-amz-target']);
    const hash = (input: string) => createHash('sha256').update(input).digest('hex');
    const canonicalHeaders = names.map(name => `${name}:${headers.get(name)}\n`).join('');
    const canonicalRequest = ['POST', '/', '', canonicalHeaders, match[3], hash(String(init.body))].join('\n');
    const dayKey = createHmac('sha256', `AWS4${value.AWS_SECRET_ACCESS_KEY}`).update(date.slice(0, 8)).digest();
    const regionKey = createHmac('sha256', dayKey).update('us-east-1').digest();
    const serviceKey = createHmac('sha256', regionKey).update('cognito-idp').digest();
    const signingKey = createHmac('sha256', serviceKey).update('aws4_request').digest();
    const expected = createHmac('sha256', signingKey).update(['AWS4-HMAC-SHA256', date, match[2], hash(canonicalRequest)].join('\n')).digest('hex');
    expect(match[4]).toBe(expected);
  });

  it('resumes only the same private unconfirmed intent, without replacing confirmed credentials', async () => {
    const pending = script(exists(), existing(), {});
    await expect(createCognitoIdentity(settings(), { username: 'elena', password, requestId: intent }, pending.fetcher)).resolves.toEqual({ sub, providerUsername: username });
    expect(pending.calls.map(call => call.operation)).toEqual(['AdminCreateUser', 'AdminGetUser', 'AdminSetUserPassword']);
    for (const response of [existing('CONFIRMED'), existing('FORCE_CHANGE_PASSWORD', [{ Name: 'email', Value: 'sample@example.invalid' }]), { ...existing(), Enabled: false }]) {
      const blocked = script(exists(), response);
      await expect(createCognitoIdentity(settings(), { username: 'elena', password, requestId: intent }, blocked.fetcher)).rejects.toMatchObject({ kind: 'identity_exists' });
      expect(blocked.calls.map(call => call.operation)).not.toContain('AdminSetUserPassword');
    }
  });

  it('never deletes or retries a possibly successful mutation automatically', async () => {
    const { fetcher, calls } = script({ User: user() }, new Error(`private timeout ${password}`));
    await expect(createCognitoIdentity(settings(), { username: 'elena', password, requestId: intent }, fetcher)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(calls.map(call => call.operation)).toEqual(['AdminCreateUser', 'AdminSetUserPassword']);
  });

  it('requires a private server UUID and rejects password mismatch with provider limits before outbound calls', async () => {
    const fetcher = vi.fn();
    for (const requestId of ['client-key', `${intent}/escape`, 'aaaaaaaa-AAAA-4000-8000-aaaaaaaaaaaa']) {
      await expect(createCognitoIdentity(settings(), { username: 'elena', password, requestId }, fetcher)).rejects.toMatchObject({ kind: 'protocol_error' });
    }
    for (const value of ['short', ' leading-space-password', 'trailing-space-password ', 'embedded\twhitespace', 'embedded\u0000control', 'embedded\u007fcontrol', 'a'.repeat(257), 'x'.repeat(14), 'x'.repeat(15) + '\n']) expect(() => validateCognitoPassword(value)).toThrow();
    expect(() => validateCognitoPassword('with spaces in a password')).not.toThrow();
    expect(() => validateCognitoPassword('a'.repeat(15))).not.toThrow(); expect(() => validateCognitoPassword('a'.repeat(256))).not.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks password proof with Cognito and gets authoritative identity without returning provider tokens', async () => {
    const { fetcher, calls } = script({ AuthenticationResult: { AccessToken: 'synthetic-access-token', RefreshToken: 'synthetic-refresh-token' } }, { Username: username, UserAttributes: [{ Name: 'sub', Value: sub }] });
    await expect(authenticateCognito(settings(), { providerUsername: username, password }, fetcher)).resolves.toEqual({ sub, providerUsername: username });
    expect(calls[0].body).toMatchObject({ AuthFlow: 'ADMIN_USER_PASSWORD_AUTH', AuthParameters: { USERNAME: username, PASSWORD: password } });
    expect(calls[1].operation).toBe('GetUser'); expect(calls[1].body).toEqual({ AccessToken: 'synthetic-access-token' });
    expect(calls[1].headers.has('authorization')).toBe(false);
  });

  it.each(['SOFTWARE_TOKEN_MFA', 'SMS_MFA', 'MFA_SETUP', 'NEW_PASSWORD_REQUIRED'])('never converts a %s challenge into a signed-in identity', async ChallengeName => {
    const { fetcher, calls } = script({ ChallengeName, Session: 'private-challenge-session', AuthenticationResult: { AccessToken: 'must-not-use' } });
    await expect(authenticateCognito(settings(), { providerUsername: username, password }, fetcher)).rejects.toMatchObject({ kind: 'challenge_required' });
    expect(calls).toHaveLength(1);
  });

  it.each([
    { Username: 'another-user', UserAttributes: [{ Name: 'sub', Value: sub }] },
    { Username: username, UserAttributes: [] },
    { Username: username, UserAttributes: [{ Name: 'sub', Value: sub }, { Name: 'sub', Value: sub }] },
    { Username: username, UserAttributes: [{ Name: 'sub', Value: '' }] },
    { Username: username, UserAttributes: [{ Name: 'sub', Value: 'unsafe\nsubject' }] },
    { Username: username, UserAttributes: [{ Name: 'sub', Value: 'x'.repeat(129) }] },
  ])('rejects mismatched or ambiguous provider identity (%j)', async result => {
    const { fetcher } = script({ AuthenticationResult: { AccessToken: 'synthetic-access-token' } }, result);
    await expect(authenticateCognito(settings(), { providerUsername: username, password }, fetcher)).rejects.toMatchObject({ kind: 'protocol_error' });
  });

  it('keeps authenticated non-UUID subjects opaque and binds administrative changes to the exact subject', async () => {
    const providerSub = 'native-provider-subject:opaque_123';
    const attributes = [{ Name: 'sub', Value: providerSub }];
    const create = script({ User: { ...user(), Attributes: attributes } }, {});
    await expect(createCognitoIdentity(settings(), { username: 'elena', password, requestId: intent }, create.fetcher)).resolves.toEqual({ sub: providerSub, providerUsername: username });
    expect(create.calls[1].body.Username).toBe(providerSub);
    const auth = script({ AuthenticationResult: { AccessToken: 'synthetic-access-token' } }, { Username: username, UserAttributes: attributes });
    await expect(authenticateCognito(settings(), { providerUsername: username, password }, auth.fetcher)).resolves.toEqual({ sub: providerSub, providerUsername: username });
    const reset = script({ ...existing('CONFIRMED'), UserAttributes: attributes }, {});
    await resetCognitoPassword(settings(), { providerUsername: username, expectedSub: providerSub, password }, reset.fetcher);
    expect(reset.calls[1].body.Username).toBe(providerSub);
    const revoke = script({});
    await revokeCognitoSessions(settings(), username, providerSub, revoke.fetcher);
    expect(revoke.calls[0].body.Username).toBe(providerSub);
    const orphan = script({ ...existing(), UserAttributes: attributes }, {});
    await deleteCognitoOrphan(settings(), { providerUsername: username, requestId: intent, expectedSub: providerSub }, orphan.fetcher);
    expect(orphan.calls[1].body.Username).toBe(providerSub);
  });

  it.each(['NotAuthorizedException', 'UserNotFoundException', 'UserNotConfirmedException', 'PasswordResetRequiredException'])('maps %s to the same non-enumerating sign-in error', async code => {
    const { fetcher } = script(Response.json({ __type: code, message: `private ${password}` }, { status: 400 }));
    const error = await authenticateCognito(settings(), { providerUsername: username, password }, fetcher).catch(error => error);
    expect(error).toMatchObject({ kind: 'invalid_credentials', message: 'The username or password is incorrect.' });
    expect(error.message).not.toContain(password);
  });

  it.each([
    () => new Response('private provider body', { status: 503 }), () => new Response('not json'), () => Response.json([]),
    () => new Response(new Uint8Array([0xff, 0xfe])), () => new Response('x'.repeat(65537)),
    () => new Response('', { status: 302, headers: { Location: 'https://attacker.invalid' } }),
  ])('fails closed for invalid, oversized or redirecting provider responses', async response => {
    const { fetcher, calls } = script(response());
    const error = await authenticateCognito(settings(), { providerUsername: username, password }, fetcher).catch(error => error);
    expect(['unavailable', 'protocol_error']).toContain(error.kind); expect(error.message).not.toMatch(/private provider|attacker|password/);
    expect(calls).toHaveLength(1);
  });

  it('bounds hanging fetches and response streams without leaking their failure details', async () => {
    for (const response of [false, true]) {
      const fetcher = (_url: string, init: RequestInit) => response
        ? Promise.resolve(new Response(new ReadableStream<Uint8Array>({ start() {} })))
        : new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('private timeout detail')), { once: true }));
      await expect(authenticateCognito(settings(), { providerUsername: username, password }, fetcher, 5)).rejects.toMatchObject({ kind: 'unavailable' });
    }
  });

  it('matches immutable subject before a recovery reset, then mutates by sub and revokes provider tokens', async () => {
    const valid = script(existing('CONFIRMED'), {}, {});
    await resetCognitoPassword(settings(), { providerUsername: username, expectedSub: sub, password }, valid.fetcher);
    await revokeCognitoSessions(settings(), username, sub, valid.fetcher);
    expect(valid.calls.map(call => call.operation)).toEqual(['AdminGetUser', 'AdminSetUserPassword', 'AdminUserGlobalSignOut']);
    expect(valid.calls[1].body.Username).toBe(sub); expect(valid.calls[2].body.Username).toBe(sub);
    const mismatch = script(existing('CONFIRMED'));
    await expect(resetCognitoPassword(settings(), { providerUsername: username, expectedSub: intent, password }, mismatch.fetcher)).rejects.toMatchObject({ kind: 'protocol_error' });
    expect(mismatch.calls).toHaveLength(1);
  });

  it('allows explicit orphan cleanup only for a matching still-temporary private intent', async () => {
    const valid = script(existing(), {});
    await deleteCognitoOrphan(settings(), { providerUsername: username, requestId: intent, expectedSub: sub }, valid.fetcher);
    expect(valid.calls[1].body.Username).toBe(sub);
    const confirmed = script(existing('CONFIRMED'));
    await expect(deleteCognitoOrphan(settings(), { providerUsername: username, requestId: intent, expectedSub: sub }, confirmed.fetcher)).rejects.toMatchObject({ kind: 'identity_exists' });
    expect(confirmed.calls).toHaveLength(1);
  });
});
