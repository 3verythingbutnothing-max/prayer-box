/** First-party account APIs. No credentials or recovery codes enter browser storage. */
export type RegistrationConfig = {
  registrationAvailable: boolean;
  signInAvailable: boolean;
  recoveryAvailable: boolean;
  teenRegistrationAvailable?: boolean;
  turnstileSiteKey: string | null;
  csrfToken: string | null;
};
export type RegistrationResult = { registered: true; username: string; recoveryCodes: string[]; message?: string };
export class RegistrationError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly code: string;
  constructor(message: string, status: number, retryable: boolean, code = '') {
    super(message);
    this.name = 'RegistrationError';
    this.status = status; this.retryable = retryable; this.code = code;
  }
}

async function accountApi(path: string, input?: unknown, csrfToken?: string, idempotencyKey?: string): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(path, {
      method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
      redirect: 'error', signal: controller.signal,
      ...(input === undefined ? {} : {
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken ?? '', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        body: JSON.stringify(input),
      }),
    });
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing account response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 65_536) { await reader.cancel(); throw new Error('Account response too large'); }
        chunks.push(part.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid account response');
    const result = value as Record<string, unknown>;
    if (!response.ok) {
      const error = result.error && typeof result.error === 'object' ? result.error as Record<string, unknown> : {};
      throw new RegistrationError(typeof error.message === 'string' ? error.message : 'We could not complete this step. Please try again.', response.status, error.retryable === true, typeof error.code === 'string' ? error.code : '');
    }
    return result;
  } catch (error) {
    if (error instanceof RegistrationError) throw error;
    throw new RegistrationError('We could not confirm the connection. Keep this page open and retry the same step, or try signing in if you just created an account.', 0, true);
  } finally { window.clearTimeout(timeout); }
}

// Share only simultaneous bootstrap requests (including React StrictMode's effect
// replay). Never cache a CSRF token or account response across later visits.
let configurationRequest: Promise<RegistrationConfig> | undefined;
export function getRegistrationConfig(): Promise<RegistrationConfig> {
  if (!configurationRequest) configurationRequest = accountApi('/api/auth/config').then(value => {
    if (typeof value.registrationAvailable !== 'boolean' || typeof value.signInAvailable !== 'boolean' || typeof value.recoveryAvailable !== 'boolean'
      || !(value.csrfToken === null || typeof value.csrfToken === 'string') || !(value.turnstileSiteKey === null || typeof value.turnstileSiteKey === 'string')) throw new RegistrationError('Account setup is not available yet. Please try again later.', 503, true);
    return value as RegistrationConfig;
  }).finally(() => { configurationRequest = undefined; });
  return configurationRequest;
}
function recoveryCodes(value: unknown, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > 20 || value.some(code => typeof code !== 'string' || code.length < 8 || code.length > 160)) throw new RegistrationError('Your account step completed, but we could not display a recovery kit. Sign in to create a replacement kit.', 502, false);
  return value as string[];
}
export async function registerAccount(input: { username: string; password: string; ageBand: 'adult' | 'teen'; language: 'en'; inviteCode: string; turnstileToken: string }, csrfToken: string, key: string): Promise<RegistrationResult> {
  const value = await accountApi('/api/auth/register', input, csrfToken, key);
  if (value.registered !== true || typeof value.username !== 'string') throw new RegistrationError('We could not confirm account creation. Retry the same step or try signing in.', 502, true);
  return { registered: true, username: value.username, recoveryCodes: recoveryCodes(value.recoveryCodes, true), ...(typeof value.message === 'string' ? { message: value.message } : {}) };
}
export async function signInAccount(input: { username: string; password: string; turnstileToken: string }, csrfToken: string) {
  const value = await accountApi('/api/auth/signin', input, csrfToken);
  if (value.signedIn !== true) throw new RegistrationError('We could not confirm sign-in. Please try again.', 502, true);
}
export async function recoverAccount(input: { username: string; recoveryCode: string; newPassword: string; turnstileToken: string }, csrfToken: string) {
  const value = await accountApi('/api/auth/recover', input, csrfToken);
  if (value.reset !== true) throw new RegistrationError('We could not confirm the password change. Try signing in with your new password before retrying.', 502, true);
}
export async function rotateRecoveryKit(csrfToken: string): Promise<string[]> {
  const value = await accountApi('/api/auth/recovery-kit/rotate', {}, csrfToken);
  return recoveryCodes(value.recoveryCodes);
}
export async function signOutAccount(csrfToken: string): Promise<void> {
  const value = await accountApi('/api/session/logout', {}, csrfToken);
  if (value.signedOut !== true) throw new RegistrationError('Sign-out could not be confirmed. Please try again.', 502, true);
}

/** A provider error can arrive after an invitation/identity was reserved. */
export type SignupAttempt = {
  key: string | null;
  reservationPossible: boolean;
  identityLocked: boolean;
  allLocked: boolean;
  halted: boolean;
  notice: string;
};
export function emptySignupAttempt(): SignupAttempt {
  return { key: null, reservationPossible: false, identityLocked: false, allLocked: false, halted: false, notice: '' };
}
export function beginSignupAttempt(state: SignupAttempt, freshKey: string): SignupAttempt {
  return { ...state, key: state.key ?? freshKey, identityLocked: true };
}
export function editSignupAttempt(state: SignupAttempt, field: 'identity' | 'password'): SignupAttempt {
  if (field === 'password') return state;
  // Identity edits are not allowed to abandon an invitation that may be claimed.
  return state.identityLocked ? state : emptySignupAttempt();
}
const preIntentErrors = new Set([
  'invalid_invitation', 'username_unavailable', 'invalid_username', 'invalid_csrf',
  'bot_verification_required', 'bot_verification_failed', 'bot_verification_unavailable',
  'invalid_eligibility', 'safeguarding_pending', 'invalid_request_key', 'invalid_account_request', 'rate_limited',
]);
export function failSignupAttempt(state: SignupAttempt, error: { status: number; code?: string }): SignupAttempt {
  if (state.halted) return state;
  if (error.code === 'registration_reconciliation_required' || error.code === 'recovery_reconciliation_required') return {
    ...state, reservationPossible: true, identityLocked: true, allLocked: true, halted: true,
    notice: 'Account services need a secure review before this can continue. Use the help options, and keep your password and recovery codes private.',
  };
  if (error.status === 400 && error.code === 'invalid_password') return {
    ...state, reservationPossible: true, identityLocked: true, allLocked: false,
    notice: 'Your invitation and username may already be reserved. Keep those details unchanged, correct only your password, and retry this same account attempt.',
  };
  if (error.code && preIntentErrors.has(error.code)) {
    // A later verification/rate error says nothing about an earlier provider call.
    return state.reservationPossible ? { ...state, identityLocked: true } : emptySignupAttempt();
  }
  return {
    ...state, reservationPossible: true, identityLocked: true, allLocked: true,
    notice: 'This account may already have been created. Your values are kept unchanged so retrying checks the same attempt. You can also try signing in.',
  };
}
