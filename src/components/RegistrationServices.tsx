import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import BotCheck from './BackendBotCheck';
import { beginSignupAttempt, editSignupAttempt, emptySignupAttempt, failSignupAttempt, getRegistrationConfig, recoverAccount, registerAccount, RegistrationError, rotateRecoveryKit, signInAccount } from '../registration-client';
import type { RegistrationConfig, RegistrationResult, SignupAttempt } from '../registration-client';
import '../registration-services.css';

type Mode = 'signup' | 'signin' | 'recovery';
type Props = { mode: Mode; onAuthenticated: () => void; onNavigate: (route: string) => void; onReset?: () => void };
const passwordHint = 'Use 15–256 characters. Spaces inside a passphrase are welcome; do not start or end with whitespace or use tabs, newlines, or control characters. Your password is never trimmed or shortened.';
function validPassword(value: string) { return [...value].length >= 15 && value.length <= 256 && value.trim() === value && !/[\u0000-\u001f\u007f]|[^\S ]/u.test(value); }

function RecoveryCodes({ codes }: { codes: readonly string[] }) {
  return <div className="registration-kit"><p>These codes are shown only here. Save them somewhere private. Each code works once; a replacement kit invalidates the previous kit.</p><ul aria-label="Your recovery codes">{codes.map(code => <li key={code}><code>{code}</code></li>)}</ul><p className="registration-help">Anyone with a recovery code may be able to reset your password. Never include one in a prayer, screenshot, or support message.</p></div>;
}

/** Only mounted by the connected app. Server capabilities keep public intake closed. */
export default function RegistrationServices({ mode, onAuthenticated, onNavigate, onReset }: Props) {
  const [config, setConfig] = useState<RegistrationConfig | null>(null);
  const [configError, setConfigError] = useState('');
  const [configBusy, setConfigBusy] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [age, setAge] = useState<'' | 'under13' | 'teen' | 'adult'>('');
  const [showPassword, setShowPassword] = useState(false);
  const [token, setToken] = useState('');
  const tokenChanged = useCallback((value: string) => setToken(value), []);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [attemptState, setAttemptState] = useState<SignupAttempt>(emptySignupAttempt);
  const attemptRef = useRef<SignupAttempt>(emptySignupAttempt());
  function updateAttempt(next: SignupAttempt) { attemptRef.current = next; setAttemptState(next); }
  const [error, setError] = useState('');
  const [recoveryNeedsReview, setRecoveryNeedsReview] = useState(false);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [resetComplete, setResetComplete] = useState(false);
  const [savedKit, setSavedKit] = useState(false);
  const submitting = useRef(false);
  const reviewStop = useRef(false);
  const alive = useRef(true);
  const configSequence = useRef(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const mainHeading = useRef<HTMLHeadingElement>(null);
  const availabilityHeading = useRef<HTMLHeadingElement>(null);
  const restoreAvailabilityFocus = useRef(false);
  const { prepare, respond } = useActionFeedback();
  const refreshConfig = useCallback(() => {
    const sequence = ++configSequence.current;
    setConfigBusy(true); setConfigError('');
    return getRegistrationConfig().then(next => {
      if (!alive.current || sequence !== configSequence.current) return;
      setConfig(next); setToken(''); setVerificationAttempt(value => value + 1);
    }).catch(failure => {
      if (alive.current && sequence === configSequence.current) setConfigError(failure instanceof Error ? failure.message : 'Account setup could not connect. Please try again.');
    }).finally(() => { if (alive.current && sequence === configSequence.current) setConfigBusy(false); });
  }, []);
  useEffect(() => { alive.current = true; void refreshConfig(); return () => { alive.current = false; configSequence.current++; }; }, [refreshConfig]);
  useEffect(() => { if (result || resetComplete) resultHeading.current?.focus(); }, [result, resetComplete]);
  useEffect(() => { if (!configBusy && restoreAvailabilityFocus.current) { restoreAvailabilityFocus.current = false; (availabilityHeading.current ?? mainHeading.current)?.focus({ preventScroll: true }); } }, [config, configBusy]);
  const retryAvailability = () => { restoreAvailabilityFocus.current = true; void refreshConfig(); };

  const title = mode === 'signup' ? 'Your prayer box starts here.' : mode === 'signin' ? 'Welcome back.' : 'A way back to your box.';
  const available = !!config && !!config.csrfToken && !!config.turnstileSiteKey && (mode === 'signup' ? config.registrationAvailable : mode === 'signin' ? config.signInAvailable : config.recoveryAvailable);
  const ageEligible = age === 'adult' || age === 'teen' && config?.teenRegistrationAvailable === true;
  const locked = attemptState.allLocked;
  const reconciliationRequired = attemptState.halted || recoveryNeedsReview;
  const editable = !busy && !locked && !reconciliationRequired;
  const identityEditable = editable && (mode !== 'signup' || !attemptState.identityLocked);
  const changed = (field: 'identity' | 'password' = 'identity') => { if (mode === 'signup') updateAttempt(editSignupAttempt(attemptRef.current, field)); setError(''); };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || reviewStop.current || reconciliationRequired || !available || !config?.csrfToken || !token || mode === 'signup' && !ageEligible) return;
    prepare(); setError('');
    if (!/^[a-z0-9_-]{3,32}$/.test(username)) { setError('Use a username with 3–32 lowercase letters, numbers, underscores, or hyphens.'); return; }
    if (mode !== 'signin' && !validPassword(password)) { setError(passwordHint); return; }
    if (mode === 'recovery' && password !== confirmation) { setError('The two new passwords do not match. Your draft is still here.'); return; }
    submitting.current = true; setBusy(true);
    try {
      if (mode === 'signup') {
        const attempt = beginSignupAttempt(attemptRef.current, crypto.randomUUID());
        updateAttempt(attempt);
        const created = await registerAccount({ username, password, ageBand: age === 'teen' ? 'teen' : 'adult', language: 'en', inviteCode, turnstileToken: token }, config.csrfToken, attempt.key!);
        if (!alive.current) return;
        setPassword(''); setInviteCode(''); setResult(created); setSavedKit(false); updateAttempt(emptySignupAttempt());
        respond({ tone: 'success', title: 'Your Prayer Box account is created.', message: created.recoveryCodes.length ? 'Save your recovery kit before continuing to sign in.' : 'Sign in to create a replacement recovery kit.' });
      } else if (mode === 'signin') {
        await signInAccount({ username, password, turnstileToken: token }, config.csrfToken);
        if (!alive.current) return;
        setPassword('');
        onAuthenticated();
        respond({ tone: 'success', title: 'Welcome back to Prayer Box.' });
      } else {
        await recoverAccount({ username, recoveryCode, newPassword: password, turnstileToken: token }, config.csrfToken);
        if (!alive.current) return;
        setPassword(''); setConfirmation(''); setRecoveryCode(''); setResetComplete(true); onReset?.();
        respond({ tone: 'success', title: 'Your password has been changed.', message: 'Sign in again and create a replacement recovery kit.' });
      }
    } catch (failure) {
      if (!alive.current) return;
      const detail = failure instanceof Error ? failure.message : 'This step could not be completed. Your draft is still here.';
      setError(detail);
      if (failure instanceof RegistrationError && ['registration_reconciliation_required', 'recovery_reconciliation_required'].includes(failure.code)) reviewStop.current = true;
      if (mode === 'signup') updateAttempt(failSignupAttempt(attemptRef.current, failure instanceof RegistrationError ? failure : { status: 0 }));
      if (mode === 'recovery' && failure instanceof RegistrationError && ['registration_reconciliation_required', 'recovery_reconciliation_required'].includes(failure.code)) { setRecoveryNeedsReview(true); onReset?.(); }
      respond({ tone: 'info', title: mode === 'signup' ? 'We could not confirm account creation.' : mode === 'signin' ? 'Sign-in needs another try.' : 'Recovery needs another try.', message: detail });
      if (failure instanceof RegistrationError && failure.code === 'invalid_csrf') void refreshConfig();
    } finally {
      submitting.current = false;
      if (alive.current) { setBusy(false); setToken(''); setVerificationAttempt(value => value + 1); }
    }
  }

  return <section className="registration-services" aria-labelledby="registration-title">
    <header className="registration-intro"><p className="eyebrow">{mode === 'signup' ? 'A little space for prayer' : mode === 'signin' ? 'Return to your prayers' : 'Account recovery'}</p><h1 ref={mainHeading} id="registration-title" tabIndex={-1}>{title}</h1><p>{mode === 'signup' ? 'Start with a username and password. Email, phone, and a profile picture can come later.' : mode === 'signin' ? 'Sign in to your private account.' : 'Use a saved recovery code to choose a new password.'}</p></header>
    <div className="registration-layout"><section className="backend-card registration-card">
      {result ? <div className="registration-complete"><span className="registration-symbol success"><Icon name="check" size={27}/></span><h2 ref={resultHeading} tabIndex={-1}>Keep a way back, @{result.username}.</h2>
        {result.recoveryCodes.length ? <><RecoveryCodes codes={result.recoveryCodes}/><label className="registration-check"><input type="checkbox" checked={savedKit} onChange={event => setSavedKit(event.target.checked)}/><span>I’ve saved my recovery codes somewhere private.</span></label></> : <p>{result.message ?? 'This account was already created. Recovery codes cannot be shown again. Sign in and create a replacement recovery kit.'}</p>}
        <button type="button" className="button primary" disabled={result.recoveryCodes.length > 0 && !savedKit} onClick={() => { setResult(null); onNavigate('signin'); }}>Continue to sign in</button></div>
      : resetComplete ? <div className="registration-complete"><span className="registration-symbol success"><Icon name="check" size={27}/></span><h2 ref={resultHeading} tabIndex={-1}>Your new password is ready.</h2><p>Previous sessions have been signed out. Sign in with your new password, then create and save a replacement recovery kit.</p><button className="button primary" onClick={() => onNavigate('signin')}>Go to sign in</button></div>
      : !config ? <div className="registration-unavailable" role="status"><span className="registration-symbol"><Icon name="shield" size={27}/></span><h2 ref={availabilityHeading} tabIndex={-1}>{configError ? 'Let’s reconnect.' : 'Checking account availability…'}</h2><p>{configError || 'Please wait a moment. No account information is being submitted.'}</p>{configError && <button className="button secondary" disabled={configBusy} onClick={retryAvailability}>Try again</button>}</div>
      : !available ? <div className="registration-unavailable"><span className="registration-symbol"><Icon name="lock" size={27}/></span><h2 ref={availabilityHeading} tabIndex={-1}>{mode === 'signup' ? 'Registration is not open yet.' : mode === 'signin' ? 'Sign-in is not open yet.' : 'Recovery is not open yet.'}</h2><p>Account services are being checked before the invited web pilot. Please do not enter a password or personal information here.</p>{configError && <p className="registration-error" role="status">{configError}</p>}<div className="registration-actions"><button className="button secondary" disabled={configBusy} onClick={retryAvailability}>Check again</button><a className="text-link" href="#help">Get help</a></div></div>
      : <form className="registration-form" onSubmit={submit}>
        {mode === 'signup' && <><label htmlFor="registration-age">Age range</label><select id="registration-age" value={age} disabled={!identityEditable} onChange={event => {setAge(event.target.value as typeof age);changed();}} required><option value="">Choose an age range</option><option value="under13">Under 13</option><option value="teen">13–17</option><option value="adult">18 or older</option></select>
          {age === 'under13' && <p className="registration-notice" role="status">Prayer Box is for ages 13 and older. Please do not use another person’s age to continue.</p>}
          {age === 'teen' && <p className="registration-notice" role="status">{config.teenRegistrationAvailable ? 'Your profile starts private. Teen content needs human review, and personal delivery requires mutually accepted connections.' : 'Teen registration is waiting for safeguarding review. Please check back when this part of the pilot is ready.'}</p>}</>}
        {(mode !== 'signup' || ageEligible) && <>
          <label htmlFor="registration-username">Username</label><input id="registration-username" name="username" value={username} disabled={!identityEditable} onChange={event => {setUsername(event.target.value.toLowerCase());changed();}} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} pattern="[a-z0-9_-]{3,32}" aria-describedby="registration-username-help"/><p id="registration-username-help" className="registration-help">3–32 lowercase letters, numbers, underscores, or hyphens.</p>
          {mode === 'signup' && <><label htmlFor="registration-invite">Your invitation code</label><input id="registration-invite" value={inviteCode} disabled={!identityEditable} onChange={event => {setInviteCode(event.target.value);changed();}} autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={256}/><p className="registration-help">The first web pilot is invitation only.</p></>}
          {mode === 'recovery' && <><label htmlFor="registration-recovery-code">One saved recovery code</label><input id="registration-recovery-code" value={recoveryCode} disabled={busy || reconciliationRequired} onChange={event => {setRecoveryCode(event.target.value);changed();}} autoComplete="off" autoCapitalize="none" spellCheck={false} required maxLength={160}/><p className="registration-help">A code from your recovery kit is used once. Email and phone recovery will be added after their providers are ready.</p></>}
          <div className="registration-password-label"><label htmlFor="registration-password">{mode === 'recovery' ? 'New password' : 'Password'}</label><button type="button" className="text-link" aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div><input id="registration-password" name="password" type={showPassword ? 'text' : 'password'} value={password} disabled={!editable} onChange={event => {setPassword(event.target.value);changed('password');}} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} autoCapitalize="none" spellCheck={false} required maxLength={256} aria-describedby={mode === 'signin' ? undefined : 'registration-password-help'}/>
          {mode !== 'signin' && <p id="registration-password-help" className="registration-help">{passwordHint}</p>}
          {mode === 'recovery' && <><label htmlFor="registration-password-confirm">Confirm new password</label><input id="registration-password-confirm" type={showPassword ? 'text' : 'password'} value={confirmation} disabled={busy || reconciliationRequired} onChange={event => {setConfirmation(event.target.value);changed('password');}} autoComplete="new-password" autoCapitalize="none" spellCheck={false} required maxLength={256}/></>}
          {mode === 'signup' && <><label htmlFor="registration-language">Interface language</label><select id="registration-language" value="en" disabled><option value="en">English</option></select><p className="registration-notice">This is a place for prayer requests, not asking for donations. Financial hardship is welcome as a prayer topic; seek financial support through your local church or a fundraising platform.</p></>}
          <div className="registration-verification"><h3><Icon name="shield" size={20}/>A little protection for our community</h3>{!reconciliationRequired && <BotCheck siteKey={config.turnstileSiteKey!} attempt={verificationAttempt} onToken={tokenChanged} action={mode === 'signup' ? 'register' : mode === 'signin' ? 'signin' : 'recover'}/>}<div className="registration-actions"><button type="button" className="text-link" disabled={busy || configBusy || reconciliationRequired} onClick={() => {setToken('');setVerificationAttempt(value => value + 1);void refreshConfig();}}>Retry verification</button><a className="text-link" href="#help">Get help</a></div><p className="registration-help">If verification cannot connect, this step stays closed. Your draft can remain here while you retry.</p></div>
          {attemptState.notice && <p className="registration-notice" role="status">{attemptState.notice}</p>}
          {recoveryNeedsReview && <p className="registration-notice" role="status">Account services need a secure review before another password change. Use the help options, and keep your password and recovery codes private.</p>}
          {error && <p className="registration-error" role="alert">{error}</p>}
          <button className="button primary registration-submit" disabled={busy || reconciliationRequired || !token || !password || !username || mode === 'signup' && (!ageEligible || !inviteCode) || mode === 'recovery' && (!confirmation || !recoveryCode)}>{reconciliationRequired ? 'Secure review needed' : busy ? mode === 'signup' ? 'Creating your account…' : mode === 'signin' ? 'Signing in…' : 'Updating your password…' : mode === 'signup' ? attemptState.identityLocked ? 'Retry this account attempt' : 'Create my Prayer Box' : mode === 'signin' ? 'Sign in' : 'Create a new password'}</button>
        </>}
      </form>}
      {!result && !resetComplete && <nav className="registration-links" aria-label="Account options">{mode !== 'signup' && <button className="text-link" disabled={busy} onClick={() => onNavigate('signup')}>Create an account</button>}{mode !== 'signin' && <button className="text-link" disabled={busy} onClick={() => onNavigate('signin')}>Sign in</button>}{mode !== 'recovery' && <button className="text-link" disabled={busy} onClick={() => onNavigate('recovery')}>Recover my account</button>}</nav>}
    </section><aside className="backend-card registration-aside"><Icon name="heart" size={28}/><h2>You can come as you are.</h2><p>Bring your gratitude, questions, and unfinished story.</p><p>We come to the Father through Jesus Christ, with the help of the Holy Spirit.</p><p className="registration-help">Your personal prayer box starts private. A connection does not open your prayers to someone else.</p></aside></div>
  </section>;
}

export function RecoveryKitSettings({ csrfToken }: { csrfToken: string | null }) {
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const live = useRef(true);
  const [available, setAvailable] = useState(false);
  const { prepare, respond } = useActionFeedback();
  useEffect(() => { live.current = true; void getRegistrationConfig().then(value => { if (live.current) setAvailable(value.recoveryAvailable && value.signInAvailable); }).catch(() => { if (live.current) setAvailable(false); }); return () => { live.current = false; }; }, []);
  useEffect(() => { if (codes.length) heading.current?.focus(); }, [codes]);
  if (!available) return <section className="backend-card registration-kit-settings"><h2>Your recovery kit</h2><p>Recovery-kit management will be available when the account services are ready. No code is generated or replaced here yet.</p></section>;
  return <section className="backend-card registration-kit-settings"><h2 ref={heading} tabIndex={-1}>Your recovery kit</h2><p>Recovery codes help you get back into your account without an email address or phone number.</p>{codes.length ? <><RecoveryCodes codes={codes}/><button className="button secondary" onClick={() => {setCodes([]);heading.current?.focus();}}>I’ve saved these codes</button></> : <><p className="registration-help">Creating a replacement invalidates your previous kit. A recent sign-in is required.</p><button className="button secondary" disabled={busy || !csrfToken} onClick={async () => {
    if (submitting.current || !csrfToken) return;
    submitting.current = true; prepare();setBusy(true);setError('');
    try {const next = await rotateRecoveryKit(csrfToken);if (!live.current) return;setCodes(next);respond({tone:'success',title:'Your replacement recovery kit is ready.',message:'Save the new codes somewhere private.'});}
    catch(failure) {if (!live.current) return;const detail=failure instanceof Error?failure.message:'The kit could not be replaced. Please sign in again and try once more.';setError(detail);respond({tone:'info',title:'Your recovery kit needs another try.',message:detail});}
    finally {submitting.current=false;if (live.current) setBusy(false);}
  }}>{busy ? 'Creating replacement kit…' : 'Create replacement recovery kit'}</button></>}{error && <p className="registration-error" role="alert">{error}</p>}<a href="#signin" className="text-link">Sign in again</a></section>;
}
