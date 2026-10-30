import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import '../account-flow-preview.css';

export function AccountRecoveryPreview({ onNavigate }: { onNavigate: (route: string) => void }) {
  const feedback = useActionFeedback();
  const [method, setMethod] = useState<'email' | 'phone' | 'kit'>('email');
  const [step, setStep] = useState<'method' | 'code' | 'password' | 'complete'>('method');
  const [scenario, setScenario] = useState<'ready' | 'incorrect' | 'expired' | 'unavailable'>('ready');
  const [mismatch, setMismatch] = useState(false);
  const [kitAcknowledged, setKitAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } heading.current?.focus(); }, [step]);
  const methodLabel = method === 'email' ? 'email' : method === 'phone' ? 'phone' : 'recovery kit';
  const title = step === 'complete' ? 'A way back to your box.' : 'Recover your account.';
  const stepTitle = step === 'method' ? 'Choose a way back.' : step === 'code' ? method === 'kit' ? 'Use one saved code.' : 'Check your recovery message.' : step === 'password' ? 'Choose a new password.' : 'Recovery preview complete.';
  function advance() {
    feedback.prepare(); setError('');
    if (scenario === 'unavailable') {
      setError('The example recovery service is unavailable. Your account would stay protected; try again later or use another verified method.');
      feedback.respond({tone:'info',title:'Recovery needs another try.'}); return;
    }
    setStep('code');
    feedback.respond({tone:'info',title:method === 'kit' ? 'Your example recovery kit is ready.' : 'Check your verified recovery method.',message:'Design preview only. No email or text message was sent.'});
  }
  return <div className="account-flow-preview"><header className="account-flow-heading"><p className="eyebrow">A way back to your box</p><h1>{title}</h1><p>Use a contact you previously verified, or a saved recovery code.</p></header>
    <section className="panel account-flow-card account-recovery-preview-card">
      <div className="account-flow-step"><span className="chip">Design preview</span><Icon name="lock" size={22}/></div>
      <p className="account-flow-sample-note">All credentials and codes below are fixed examples. This walkthrough does not change an account.</p>
      <h2 className="account-flow-card-heading" ref={heading} tabIndex={-1}>{stepTitle}</h2>
      {step === 'method' && <form className="account-flow-form" onSubmit={event => {event.preventDefault();advance();}}>
        <label>Username<input readOnly value="elena" autoComplete="off" spellCheck={false}/></label>
        <label>Recovery method<select value={method} onChange={event => {setMethod(event.target.value as typeof method);setError('');}}><option value="email">Verified email</option><option value="phone">Verified phone</option><option value="kit">Saved recovery code</option></select></label>
        <p className="quiet-copy">A new or unverified contact cannot recover an existing account. Contact details are not displayed here.</p>
        <details className="account-flow-preview-controls"><summary>Preview a recovery state</summary><label>Example state<select value={scenario} onChange={event => {setScenario(event.target.value as typeof scenario);setError('');}}><option value="ready">Valid example</option><option value="incorrect">Incorrect code</option><option value="expired">Expired or already used code</option><option value="unavailable">Service unavailable</option></select></label></details>
        {error && <p className="account-flow-error" role="alert">{error}</p>}
        {error && <button className="button secondary" type="button" onClick={() => {setScenario('ready');setError('');}}>Retry example</button>}
        <button className="button primary">{method === 'kit' ? 'Use a recovery code' : 'Request recovery code'}</button>
      </form>}
      {step === 'code' && <form className="account-flow-form" onSubmit={event => {
        event.preventDefault();feedback.prepare();setError('');
        if (scenario !== 'ready') {setError(scenario === 'expired' ? 'This example code is expired or already used. Request a new code, or choose another recovery method.' : 'That example code is incorrect. Check the code and try again.');feedback.respond({tone:'info',title:'Please check your recovery code.'});return;}
        setStep('password');
      }}>
        <p>{method === 'kit' ? 'A saved recovery code is used once. A new recovery kit replaces the old kit after recovery.' : 'If an eligible account has that verified recovery method, a code would be on its way. Check your messages and spam folder.'}</p>
        <label>{method === 'kit' ? 'Example recovery-kit code' : 'Example recovery code'}<input readOnly value={scenario === 'incorrect' ? method === 'kit' ? 'PREVIEW-WRONG-0000' : '00000000' : method === 'kit' ? 'PREVIEW-ONLY-1234' : '24681357'} autoComplete="off" spellCheck={false}/></label>
        <p className="quiet-copy">{method === 'kit' ? 'This sample is not a real recovery code.' : 'The live code expires after ten minutes and has a limited number of attempts.'}</p>
        {error && <p className="account-flow-error" role="alert">{error}</p>}
        <div className="account-flow-actions"><button className="button primary">Verify example code</button>{scenario !== 'ready' && <button type="button" className="button secondary" onClick={() => {setScenario('ready');setError('');feedback.prepare();feedback.respond({tone:'info',title:method === 'kit' ? 'A valid sample code is selected.' : 'A fresh example code is ready.',message:'No real message was sent.'});}}>{scenario === 'expired' ? 'Request a new example code' : 'Use the correct example code'}</button>}</div>
        <button className="text-link" type="button" onClick={() => {setStep('method');setError('');}}>Choose another recovery method</button>
      </form>}
      {step === 'password' && <form className="account-flow-form" onSubmit={event => {
        event.preventDefault();feedback.prepare();setError('');
        if (mismatch) {setError('The two sample passwords do not match. Try the matching example.');feedback.respond({tone:'error',title:'The sample passwords do not match.'});return;}
        setStep('complete');feedback.respond({tone:'success',title:'Recovery preview complete.',message:'No real password was changed.'});
      }}>
        <label>New sample password<input type="password" readOnly value="a-new-preview-passphrase" autoComplete="off"/></label><label>Confirm sample password<input type="password" readOnly value={mismatch ? 'another-sample-password' : 'a-new-preview-passphrase'} autoComplete="off"/></label>
        <p className="quiet-copy">Use a unique passphrase of at least 15 characters in the live app. These samples cannot be used to sign in.</p>
        <details className="account-flow-preview-controls"><summary>Preview password validation</summary><label className="account-flow-check"><input type="checkbox" checked={mismatch} onChange={event => {setMismatch(event.target.checked);setError('');}}/><span>Show a mismatch example</span></label></details>
        {error && <p className="account-flow-error" role="alert">{error}</p>}
        <button className="button primary">Finish recovery preview</button>
      </form>}
      {step === 'complete' && <div className="account-flow-form"><div className="account-flow-notice"><Icon name="check"/><p>In the live app, a successful reset signs out previous sessions and invalidates old recovery challenges. This example did not change a password.</p></div><p className="quiet-copy">Recovery method previewed: {methodLabel}.</p>{method === 'kit' && <section className="account-flow-kit" aria-labelledby="replacement-kit-title"><h3 id="replacement-kit-title">Your replacement kit, previewed.</h3><p>These fictional replacements illustrate saving a new kit after using a recovery code. They cannot recover an account; no real kit was replaced.</p><code>PREVIEW-NEW-9012</code><code>PREVIEW-NEW-3456</code><label className="account-flow-check"><input type="checkbox" checked={kitAcknowledged} onChange={event => setKitAcknowledged(event.target.checked)}/><span>I understand that a replacement kit must be kept safe in the live app.</span></label></section>}<div className="account-flow-actions"><button className="button primary" disabled={method === 'kit' && !kitAcknowledged} onClick={() => onNavigate('signin')}>Go to sign in</button><button className="button secondary" onClick={() => {setStep('method');setScenario('ready');setMismatch(false);setKitAcknowledged(false);setError('');}}>Try another example</button></div></div>}
      <button className="text-link account-flow-footer-link" onClick={() => onNavigate('help')}>Find help & support <Icon name="arrow" size={17}/></button>
    </section>
  </div>;
}
