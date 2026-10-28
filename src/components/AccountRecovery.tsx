import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { getBackendSession } from '../backend-client';
import type { BackendSession } from '../backend-client';
import BotCheck from './BackendBotCheck';
import '../notification-preferences.css';

type StartResult = { challengeId: string; message: string };
type CompleteResult = { reset: boolean; message: string };
async function recoveryRequest<T>(path: string, body: Record<string, string>): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    const payload: unknown = await response.json();
    if (!response.ok) {
      const data = payload as { error?: { message?: string }; message?: string };
      throw new Error(typeof data?.error?.message === 'string' ? data.error.message : typeof data?.message === 'string' ? data.message : 'Recovery could not be completed. Please try again later.');
    }
    return payload as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('We could not confirm the result. If you were changing your password, try signing in with the new password before requesting another code.');
    throw error instanceof Error ? error : new Error('We could not connect. Please try again later.');
  } finally { window.clearTimeout(timeout); }
}

export function AccountRecovery({ onNavigate, onReset }: { onNavigate: (route: string) => void; onReset?: () => void }) {
  const feedback = useActionFeedback();
  const apiMode = import.meta.env.MODE === 'backend';
  const [session, setSession] = useState<BackendSession | null>(null);
  const [loading, setLoading] = useState(apiMode);
  const [availabilityError, setAvailabilityError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [username, setUsername] = useState('');
  const [channel, setChannel] = useState<'email' | 'phone'>('email');
  const [token, setToken] = useState('');
  const onToken = useCallback((value: string) => setToken(value), []);
  const [botAttempt, setBotAttempt] = useState(0);
  const [challenge, setChallenge] = useState<StartResult | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!apiMode) return;
    let stopped = false; setLoading(true); setAvailabilityError('');
    void getBackendSession().then(result => { if (!stopped) setSession(result); }).catch(() => { if (!stopped) { setSession(null); setAvailabilityError('We could not check recovery availability. Your account has not been changed.'); } }).finally(() => { if (!stopped) setLoading(false); });
    return () => { stopped = true; };
  }, [apiMode, refresh]);
  const ready = apiMode && Boolean(session?.capabilities.recovery && session.capabilities.turnstileSiteKey);
  async function start(event: FormEvent) {
    event.preventDefault(); feedback.prepare(); setError('');
    if (!ready || busy || !token) return;
    const cleanUsername = username.trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(cleanUsername)) { setError('Enter your account username.'); return; }
    setBusy(true);
    try {
      const result = await recoveryRequest<StartResult>('/api/recovery/start', { username: cleanUsername, channel, turnstileToken: token });
      if (!result || typeof result.challengeId !== 'string' || typeof result.message !== 'string') throw new Error('We could not confirm this recovery request. Please try again.');
      setChallenge(result); setCode('');
      feedback.respond({ tone: 'info', title: 'Check your verified recovery method.', message: result.message });
    } catch (failure) { const message = failure instanceof Error ? failure.message : 'Recovery could not start.'; setError(message); feedback.respond({ tone: 'error', title: message }); }
    finally { setToken(''); setBotAttempt(value => value + 1); setBusy(false); }
  }
  async function complete(event: FormEvent) {
    event.preventDefault(); feedback.prepare(); setError('');
    if (!ready || busy || !challenge) return;
    if (!/^\d{8}$/.test(code.trim())) { setError('Enter the eight-digit code from your recovery message.'); return; }
    if ([...password].length < 15 || new TextEncoder().encode(password).length > 1024) { setError('Use a password with at least 15 characters and no more than 1,024 bytes.'); return; }
    if (password !== confirmation) { setError('The two passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await recoveryRequest<CompleteResult>('/api/recovery/complete', { challengeId: challenge.challengeId, code: code.trim(), newPassword: password });
      if (!result || result.reset !== true) throw new Error('We could not confirm the password change. Try signing in before requesting another code.');
      onReset?.();
      setPassword(''); setConfirmation(''); setCode(''); setChallenge(null); setFinished(true);
      feedback.respond({ tone: 'success', title: 'Your password has been changed.', message: 'Previous sessions are signed out. Sign in again on each device.' });
    } catch (failure) { const message = failure instanceof Error ? failure.message : 'Your password could not be changed.'; setError(message); feedback.respond({ tone: 'error', title: message }); }
    finally { setBusy(false); }
  }
  return <section className="account-recovery" aria-labelledby="account-recovery-title"><header className="notification-preferences-heading"><p className="eyebrow">A way back to your box</p><h1 id="account-recovery-title">Recover your account.</h1><p className="page-intro">Use the email address or phone number you previously verified. We will never display your recovery contact details here.</p></header>
    <div className="panel account-recovery-card"><span className="account-recovery-icon"><Icon name={finished ? 'check' : 'lock'} size={30} /></span>
      {finished ? <div className="account-recovery-result"><h2>Your password is updated.</h2><p>Your previous sessions have been signed out. Use your new password the next time you sign in.</p><button className="button primary" onClick={() => onNavigate('signin')}>Go to sign in<Icon name="arrow" /></button></div> : <>
        {loading && <p role="status">Checking recovery availability…</p>}
        {!loading && !ready && <div className="account-recovery-unavailable" role="status"><h2>Recovery is not connected here yet.</h2><p>{availabilityError || (apiMode ? 'The recovery delivery service still needs to be configured. No code can be sent and no password can be changed from this page yet.' : 'This preview does not send recovery codes or change passwords. Please do not enter real credentials here.')}</p>{apiMode && <button className="button secondary" onClick={() => setRefresh(value => value + 1)}>Check again<Icon name="arrow" /></button>}</div>}
        {challenge ? <form onSubmit={event => void complete(event)} className="account-recovery-form"><p className="account-recovery-generic">{challenge.message}</p><fieldset disabled={!ready || busy}><legend className="sr-only">Change your password with a recovery code</legend><label>Recovery code<input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} maxLength={8} pattern="[0-9]{8}" required /></label><label>New password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={15} maxLength={1024} required /><span className="quiet-copy">At least 15 characters. A unique passphrase works well.</span></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={15} maxLength={1024} required /></label></fieldset><div className="account-recovery-actions"><button className="button primary" disabled={!ready || busy}>{busy ? 'Changing password…' : 'Change password'}<Icon name="check" /></button><button className="text-link" type="button" disabled={busy} onClick={() => { setChallenge(null); setCode(''); setPassword(''); setConfirmation(''); setError(''); setBotAttempt(value => value + 1); }}>Request a new code</button></div></form> : <form onSubmit={event => void start(event)} className="account-recovery-form"><fieldset disabled={!ready || busy}><legend className="sr-only">Request an account recovery code</legend><label>Your username<input type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={event => setUsername(event.target.value)} maxLength={65} placeholder="@username" required /></label><label>Verified recovery method<select value={channel} onChange={event => setChannel(event.target.value as 'email' | 'phone')}><option value="email">Email</option><option value="phone">Phone</option></select></label></fieldset>{ready && <div className="account-recovery-verification"><BotCheck siteKey={session!.capabilities.turnstileSiteKey!} attempt={botAttempt} action="recovery" onToken={onToken} /><button className="text-link" type="button" disabled={busy} onClick={() => setBotAttempt(value => value + 1)}>Retry verification</button><p className="quiet-copy">If verification will not load, try another browser or return later. Recovery stays protected; there is no unchecked bypass.</p></div>}<button className="button primary" disabled={!ready || busy || !token}>{busy ? 'Requesting a code…' : 'Send recovery code'}<Icon name="mail" /></button></form>}
        {error && <p className="notification-preference-error" role="alert">{error}</p>}
        <p className="quiet-copy">Recovery requires a contact method that was verified before you lost access. An unverified or newly entered address cannot recover an existing account.</p>
      </>}
      <button className="text-link" onClick={() => onNavigate('help')}>Find help & support<Icon name="arrow" size={18} /></button>
    </div></section>;
}
