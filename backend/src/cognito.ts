import type { BackendEnv } from './env.ts';
import { readBoundedBytes } from './http.ts';

/** Sole credential authority. No provider password/token is persisted or returned. */
export type CognitoEnvironment = Omit<BackendEnv, 'COGNITO_REGION' | 'COGNITO_USER_POOL_ID' | 'COGNITO_CLIENT_ID' | 'AWS_ACCESS_KEY_ID' | 'AWS_SECRET_ACCESS_KEY' | 'AWS_SESSION_TOKEN'> & {
  COGNITO_REGION?: string;
  COGNITO_USER_POOL_ID?: string;
  COGNITO_CLIENT_ID?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  AWS_SESSION_TOKEN?: string;
};
export type CognitoFetcher = (url: string, init: RequestInit) => Promise<Response>;
export type CognitoIdentity = { sub: string; providerUsername: string };
export type CognitoErrorKind = 'unavailable' | 'invalid_credentials' | 'identity_exists' | 'challenge_required' | 'invalid_password' | 'protocol_error';
export class CognitoError extends Error {
  constructor(readonly kind: CognitoErrorKind) {
    const messages: Record<CognitoErrorKind, string> = {
      unavailable: 'Account services are temporarily unavailable. Please try again.',
      invalid_credentials: 'The username or password is incorrect.',
      identity_exists: 'This registration needs another sign-in attempt.',
      challenge_required: 'Additional verification is required before sign-in can finish.',
      invalid_password: 'Use 15–256 characters without leading or trailing spaces.',
      protocol_error: 'Account services could not complete this request. Please try again.',
    };
    super(messages[kind]);
    this.name = 'CognitoError';
  }
}

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const opaqueUsername = /^pb-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// Commercial AWS partition only. No caller-controlled host, path, URL or proxy.
const regionPattern = /^(?:af|ap|ca|eu|il|me|mx|sa|us)-(?:central|east|west|north|south|southeast|northeast)-[1-9]$/;
const defaultFetch: CognitoFetcher = (url, init) => fetch(url, init);
type Config = { region: string; poolId: string; clientId: string; accessKey: string; secret: string; sessionToken?: string; endpoint: string };
function configuration(env: CognitoEnvironment): Config | null {
  const region = env.COGNITO_REGION;
  const poolId = env.COGNITO_USER_POOL_ID;
  const clientId = env.COGNITO_CLIENT_ID;
  const accessKey = env.AWS_ACCESS_KEY_ID;
  const secret = env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = env.AWS_SESSION_TOKEN;
  if (!region || !regionPattern.test(region) || !poolId || poolId.length > 55 || !poolId.startsWith(`${region}_`)
    || !/^[A-Za-z0-9]+$/.test(poolId.slice(region.length + 1)) || !clientId || !/^[a-z0-9]{1,128}$/.test(clientId)
    || !accessKey || !/^[A-Z0-9]{16,128}$/.test(accessKey) || !secret || !/^[A-Za-z0-9/+=]{32,256}$/.test(secret)
    || sessionToken !== undefined && !/^[A-Za-z0-9/+=._-]{1,8192}$/.test(sessionToken)) return null;
  return { region, poolId, clientId, accessKey, secret, sessionToken, endpoint: `https://cognito-idp.${region}.amazonaws.com/` };
}
export function cognitoConfigured(env: CognitoEnvironment): boolean { return configuration(env) !== null; }
export const configured = cognitoConfigured;
function config(env: CognitoEnvironment): Config {
  const value = configuration(env);
  if (!value) throw new CognitoError('unavailable');
  return value;
}
function checkUsername(value: string): void {
  if (!opaqueUsername.test(value)) throw new CognitoError('protocol_error');
}
export function validateCognitoPassword(password: unknown): asserts password is string {
  // AWS's guide allows internal spaces. The unanchored API pattern is [\S]+;
  // never infer full-match no-space rules or silently trim a person's password.
  if (typeof password !== 'string' || [...password].length < 15 || password.length > 256 || /^\s|\s$/u.test(password) || /[^\S ]|[\u0000-\u001f\u007f]/u.test(password)) throw new CognitoError('invalid_password');
}
const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
const text = (value: string) => new TextEncoder().encode(value);
async function sha256(value: string): Promise<string> { return hex(await crypto.subtle.digest('SHA-256', text(value))); }
async function hmac(key: string | ArrayBuffer, value: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', typeof key === 'string' ? text(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, text(value));
}
async function signedHeaders(value: Config, operation: string, body: string): Promise<Record<string, string>> {
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = now.slice(0, 8);
  const headers: Record<string, string> = {
    'content-type': 'application/x-amz-json-1.1',
    host: new URL(value.endpoint).host,
    'x-amz-date': now,
    'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
    ...(value.sessionToken ? { 'x-amz-security-token': value.sessionToken } : {}),
  };
  const names = Object.keys(headers).sort();
  const signed = names.join(';');
  const canonical = names.map(name => `${name}:${headers[name].trim().replace(/\s+/g, ' ')}\n`).join('');
  const canonicalRequest = `POST\n/\n\n${canonical}\n${signed}\n${await sha256(body)}`;
  const scope = `${day}/${value.region}/cognito-idp/aws4_request`;
  const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${value.secret}`, day), value.region), 'cognito-idp'), 'aws4_request');
  const signature = hex(await hmac(signingKey, `AWS4-HMAC-SHA256\n${now}\n${scope}\n${await sha256(canonicalRequest)}`));
  headers.authorization = `AWS4-HMAC-SHA256 Credential=${value.accessKey}/${scope}, SignedHeaders=${signed}, Signature=${signature}`;
  return headers;
}
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function providerError(body: Record<string, unknown>, operation: string): CognitoError {
  const code = typeof body.__type === 'string' ? body.__type.split(/[#:]/).at(-1) : undefined;
  if (operation === 'AdminCreateUser' && code === 'UsernameExistsException') return new CognitoError('identity_exists');
  if (['InvalidPasswordException', 'PasswordHistoryPolicyViolationException'].includes(code ?? '')) return new CognitoError('invalid_password');
  if (operation === 'AdminInitiateAuth' && ['NotAuthorizedException', 'UserNotFoundException', 'UserNotConfirmedException', 'PasswordResetRequiredException'].includes(code ?? '')) return new CognitoError('invalid_credentials');
  return new CognitoError('unavailable');
}
async function request(value: Config, operation: string, payload: Record<string, unknown>, fetcher: CognitoFetcher,
  timeoutMs = 8000, signed = true): Promise<Record<string, unknown>> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 8000) throw new CognitoError('protocol_error');
  const body = JSON.stringify(payload);
  const headers = signed ? await signedHeaders(value, operation, body) : {
    'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${operation}`,
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetcher(value.endpoint, { method: 'POST', redirect: 'error', headers, body, signal: controller.signal });
    if (response.redirected || response.status >= 300 && response.status < 400) throw new CognitoError('unavailable');
    const bytes = await readBoundedBytes(response.body, 65_536, controller.signal);
    const decoded = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
    const result: unknown = decoded.length ? JSON.parse(decoded) : {};
    if (!object(result)) throw new CognitoError('protocol_error');
    if (!response.ok) throw providerError(result, operation);
    return result;
  } catch (error) {
    // Upstream errors may echo secrets or credentials; never expose their text.
    if (error instanceof CognitoError) throw error;
    throw new CognitoError('unavailable');
  } finally { clearTimeout(timeout); }
}
function identity(value: Record<string, unknown>, providerUsername: string, attributesKey: 'Attributes' | 'UserAttributes'): CognitoIdentity {
  if (value.Username !== providerUsername || !Array.isArray(value[attributesKey])) throw new CognitoError('protocol_error');
  const sub = value[attributesKey].filter((attribute: unknown) => object(attribute) && attribute.Name === 'sub');
  if (sub.length !== 1 || !object(sub[0]) || typeof sub[0].Value !== 'string' || !uuid.test(sub[0].Value)) throw new CognitoError('protocol_error');
  return { sub: sub[0].Value, providerUsername };
}
function pendingIdentity(value: Record<string, unknown>, providerUsername: string, attributesKey: 'Attributes' | 'UserAttributes'): CognitoIdentity {
  const result = identity(value, providerUsername, attributesKey);
  if (value.Enabled !== true || value.UserStatus !== 'FORCE_CHANGE_PASSWORD'
    || (value[attributesKey] as unknown[]).some(attribute => !object(attribute) || attribute.Name !== 'sub')) throw new CognitoError('identity_exists');
  return result;
}

/** requestId is a private, server-generated registration-intent UUID, not a browser idempotency key. */
export async function createCognitoIdentity(env: CognitoEnvironment, input: { username: string; password: string; requestId: string },
  fetcher: CognitoFetcher = defaultFetch, timeoutMs = 8000): Promise<CognitoIdentity> {
  const value = config(env);
  validateCognitoPassword(input.password);
  if (!uuid.test(input.requestId) || !/^[a-z0-9_-]{3,32}$/.test(input.username)) throw new CognitoError('protocol_error');
  const providerUsername = `pb-${input.requestId}`;
  let created: CognitoIdentity | undefined;
  let response: Record<string, unknown> | undefined;
  try {
    const random = new Uint8Array(32); crypto.getRandomValues(random);
    const temporaryPassword = `Aa1!${Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    response = await request(value, 'AdminCreateUser', { UserPoolId: value.poolId, Username: providerUsername,
      MessageAction: 'SUPPRESS', TemporaryPassword: temporaryPassword, UserAttributes: [] }, fetcher, timeoutMs);
  } catch (error) {
    if (!(error instanceof CognitoError) || error.kind !== 'identity_exists') throw error;
    // Resume only an unconfirmed identity belonging to this private intent. Never
    // overwrite a confirmed account after an ambiguous previous successful call.
    const existing = await request(value, 'AdminGetUser', { UserPoolId: value.poolId, Username: providerUsername }, fetcher, timeoutMs);
    created = pendingIdentity(existing, providerUsername, 'UserAttributes');
  }
  if (response) {
    if (!object(response.User)) throw new CognitoError('protocol_error');
    created = pendingIdentity(response.User, providerUsername, 'Attributes');
  }
  if (!created) throw new CognitoError('protocol_error');
  await request(value, 'AdminSetUserPassword', { UserPoolId: value.poolId, Username: created.sub, Password: input.password, Permanent: true }, fetcher, timeoutMs);
  return created;
}

export async function authenticateCognito(env: CognitoEnvironment, input: { providerUsername: string; password: string },
  fetcher: CognitoFetcher = defaultFetch, timeoutMs = 8000): Promise<CognitoIdentity> {
  const value = config(env);
  checkUsername(input.providerUsername);
  if (typeof input.password !== 'string' || !input.password.length || input.password.length > 256 || /^\s|\s$/u.test(input.password) || /[^\S ]/u.test(input.password)) throw new CognitoError('invalid_credentials');
  const result = await request(value, 'AdminInitiateAuth', { UserPoolId: value.poolId, ClientId: value.clientId,
    AuthFlow: 'ADMIN_USER_PASSWORD_AUTH', AuthParameters: { USERNAME: input.providerUsername, PASSWORD: input.password } }, fetcher, timeoutMs);
  if (result.ChallengeName !== undefined || result.Session !== undefined) throw new CognitoError('challenge_required');
  if (!object(result.AuthenticationResult) || typeof result.AuthenticationResult.AccessToken !== 'string'
    || result.AuthenticationResult.AccessToken.length < 1 || result.AuthenticationResult.AccessToken.length > 16384) throw new CognitoError('protocol_error');
  const user = await request(value, 'GetUser', { AccessToken: result.AuthenticationResult.AccessToken }, fetcher, timeoutMs, false);
  return identity(user, input.providerUsername, 'UserAttributes');
}

export async function resetCognitoPassword(env: CognitoEnvironment, input: { providerUsername: string; password: string; expectedSub: string },
  fetcher: CognitoFetcher = defaultFetch, timeoutMs = 8000): Promise<void> {
  const value = config(env); checkUsername(input.providerUsername); validateCognitoPassword(input.password);
  if (!uuid.test(input.expectedSub)) throw new CognitoError('protocol_error');
  const existing = await request(value, 'AdminGetUser', { UserPoolId: value.poolId, Username: input.providerUsername }, fetcher, timeoutMs);
  const found = identity(existing, input.providerUsername, 'UserAttributes');
  if (found.sub !== input.expectedSub || existing.Enabled !== true || !['CONFIRMED', 'RESET_REQUIRED'].includes(String(existing.UserStatus))
    || (existing.UserAttributes as unknown[]).some(attribute => object(attribute) && attribute.Name === 'identities')) throw new CognitoError('protocol_error');
  await request(value, 'AdminSetUserPassword', { UserPoolId: value.poolId, Username: found.sub, Password: input.password, Permanent: true }, fetcher, timeoutMs);
}

export async function revokeCognitoSessions(env: CognitoEnvironment, providerUsername: string, expectedSub: string,
  fetcher: CognitoFetcher = defaultFetch, timeoutMs = 8000): Promise<void> {
  const value = config(env); checkUsername(providerUsername);
  if (!uuid.test(expectedSub)) throw new CognitoError('protocol_error');
  // Both values come from the trusted application mapping; target the immutable
  // subject so an administrator's later username reuse cannot revoke another user.
  await request(value, 'AdminUserGlobalSignOut', { UserPoolId: value.poolId, Username: expectedSub }, fetcher, timeoutMs);
}

/** Explicit reconciliation only; never automatically delete after an uncertain provider mutation. */
export async function deleteCognitoOrphan(env: CognitoEnvironment, input: { providerUsername: string; requestId: string; expectedSub: string },
  fetcher: CognitoFetcher = defaultFetch, timeoutMs = 8000): Promise<void> {
  const value = config(env);
  if (!uuid.test(input.requestId) || !uuid.test(input.expectedSub) || input.providerUsername !== `pb-${input.requestId}`) throw new CognitoError('protocol_error');
  const existing = await request(value, 'AdminGetUser', { UserPoolId: value.poolId, Username: input.providerUsername }, fetcher, timeoutMs);
  const found = pendingIdentity(existing, input.providerUsername, 'UserAttributes');
  if (found.sub !== input.expectedSub) throw new CognitoError('protocol_error');
  await request(value, 'AdminDeleteUser', { UserPoolId: value.poolId, Username: found.sub }, fetcher, timeoutMs);
}
