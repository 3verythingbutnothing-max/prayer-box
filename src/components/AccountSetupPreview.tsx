import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import type { UiLanguage } from '../localization';
import '../account-flow-preview.css';

type AgeBand = '' | 'under13' | 'teen' | 'adult';
type RecoveryContact = 'email' | 'phone';
type VerificationStage = 'choose' | 'pending' | 'code' | 'verified' | 'failed';
type Props = {
  language: UiLanguage;
  onLanguageChange: (language: UiLanguage) => void;
  onNavigate: (route: string) => void;
  onComplete: (organization: boolean) => void;
};

export function AccountSetupPreview({ language, onLanguageChange, onNavigate, onComplete }: Props) {
  const feedback = useActionFeedback();
  const [ageBand, setAgeBand] = useState<AgeBand>('');
  const [organization, setOrganization] = useState(false);
  const [step, setStep] = useState<'details' | 'review' | 'recovery'>('details');
  const [scenario, setScenario] = useState<'ready' | 'username' | 'connection' | 'verification'>('ready');
  const [recovery, setRecovery] = useState<'none' | 'email' | 'phone' | 'both'>('none');
  const [verifiedContacts, setVerifiedContacts] = useState<RecoveryContact[]>([]);
  const [verificationTarget, setVerificationTarget] = useState<RecoveryContact>('email');
  const [verificationStage, setVerificationStage] = useState<VerificationStage>('choose');
  const [verificationScenario, setVerificationScenario] = useState<'ready' | 'incorrect' | 'expired' | 'unavailable'>('ready');
  const [verificationError, setVerificationError] = useState('');
  const [error, setError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (verificationStage !== 'pending') heading.current?.focus();
  }, [step, verificationStage]);
  useEffect(() => {
    if (step !== 'recovery' || verificationStage !== 'pending') return;
    const timer = window.setTimeout(() => {
      if (verificationScenario === 'unavailable') {
        setVerificationError('The example verification service is unavailable. Retry the example, choose another contact option, or skip for now.');
        setVerificationStage('failed');
      } else setVerificationStage('code');
    }, 450);
    return () => window.clearTimeout(timer);
  }, [step, verificationStage, verificationScenario]);
  const requiredContacts: RecoveryContact[] = recovery === 'both' ? ['email', 'phone'] : recovery === 'none' ? [] : [recovery];
  const nextContact = requiredContacts.find(contact => !verifiedContacts.includes(contact));
  const beginVerification = (contact: RecoveryContact) => {
    feedback.prepare(); setVerificationTarget(contact); setVerificationError(''); setVerificationStage('pending');
  };
  const recoveryHeading = verificationStage === 'code' ? `Check your sample ${verificationTarget} code.` : verificationStage === 'verified' ? 'Recovery option previewed.' : 'Choose a recovery option.';
  const finish = () => {
    feedback.prepare(); onComplete(organization);
    feedback.respond({tone:'success', title:'Your Prayer Box preview is ready.', message:'No real account or recovery contact was created.'});
  };
  return <div className="account-flow-preview account-setup-preview">
    <header className="account-flow-heading"><p className="eyebrow">Make a little space for prayer</p><h1>{step === 'recovery' ? 'Keep a way back.' : 'Your prayer box starts here.'}</h1><p>Asking for prayer is always free. Email and phone are optional.</p></header>
    <div className="account-flow-layout"><section className="panel account-flow-card">
      <div className="account-flow-step"><span className="chip">Design preview</span><span>{step === 'details' ? '1 · Your account' : step === 'review' ? '2 · Review' : '3 · Recovery, optional'}</span></div>
      <p className="account-flow-sample-note"><Icon name="lock" size={17}/><span>Sample credentials are read-only. Real registration is still closed.</span></p>
      <h2 className="account-flow-card-heading" ref={heading} tabIndex={-1}>{step === 'details' ? 'Your account.' : step === 'review' ? 'Your account, at a glance.' : recoveryHeading}</h2>
      {step === 'details' && <form className="account-flow-form" onSubmit={event => {
        event.preventDefault(); feedback.prepare();
        if (!ageBand) { setError('Choose an age range to continue.'); return; }
        if (ageBand === 'under13') { setError('Prayer Box is being prepared for people ages 13 and older. An account cannot be created for someone under 13.'); return; }
        if (scenario !== 'ready') {
          const message = scenario === 'username' ? 'That username is already taken. Choose another username before continuing.' : scenario === 'verification' ? 'Verification could not finish. Your choices are still here; retry the check or find help.' : 'We could not confirm account creation. Your choices are still here; try again.';
          setError(message); feedback.respond({tone:'info',title:'This example needs another try.'}); return;
        }
        setError(''); setStep('review');
      }}>
        <label>Username<input readOnly value="elena" autoComplete="off" spellCheck={false}/></label>
        <label>Password<input readOnly value="prayer-box-preview" type="password" autoComplete="off"/><span className="quiet-copy">The live form will accept a unique passphrase of at least 15 characters.</span></label>
        <label>Age range<select value={ageBand} onChange={event => {setAgeBand(event.target.value as AgeBand);setError('');}} required><option value="">Choose an age range</option><option value="under13">Under 13</option><option value="teen">13–17</option><option value="adult">18 or older</option></select></label>
        {ageBand === 'teen' && <div className="account-flow-notice"><Icon name="shield"/><p>Your box starts private. Personal prayer delivery will require an accepted connection, and your content will be reviewed before it is shared. Your age range is not shown on your profile.</p></div>}
        <label>Interface language<select value={language} onChange={event => onLanguageChange(event.target.value as UiLanguage)}><option value="en">English</option></select></label>
        <label className="account-flow-check"><input type="checkbox" checked={organization} onChange={event => setOrganization(event.target.checked)}/><span>I’m also setting up a ministry or organization.<small>Your personal login manages a separate group box. You can also create a group later.</small></span></label>
        <div className="account-flow-notice"><Icon name="heart"/><p>This space is for prayer requests, not asking for donations. Financial hardship is welcome as a prayer topic; use your local church or a fundraising platform for financial support.</p></div>
        <details className="account-flow-preview-controls"><summary>Preview a signup state</summary><label>Example state<select value={scenario} onChange={event => {setScenario(event.target.value as typeof scenario);setError('');}}><option value="ready">Ready to continue</option><option value="username">Username unavailable</option><option value="verification">Verification needs retry</option><option value="connection">Connection interrupted</option></select></label></details>
        {error && <p className="account-flow-error" role="alert">{error}</p>}
        {scenario === 'verification' && error && <div className="account-flow-actions"><button type="button" className="button secondary" onClick={() => {setScenario('ready');setError('');feedback.prepare();feedback.respond({tone:'info',title:'Example verification is ready to retry.'});}}>Retry verification</button><button type="button" className="text-link" onClick={() => onNavigate('help')}>Find help</button></div>}
        <button className="button primary" disabled={ageBand === 'under13'}>Review account</button>
        {ageBand === 'under13' && <p className="account-flow-error" role="status">This pilot is for ages 13 and older. Please do not enter another person’s age to continue.</p>}
      </form>}
      {step === 'review' && <div className="account-flow-form"><dl className="account-flow-review"><div><dt>Username</dt><dd>@elena</dd></div><div><dt>Visibility</dt><dd>Private</dd></div><div><dt>Age eligibility</dt><dd>{ageBand === 'teen' ? '13–17 · private teen defaults' : '18 or older'}</dd></div><div><dt>Language</dt><dd>English</dd></div><div><dt>First box</dt><dd>{organization ? 'Personal account and separate organization setup' : 'Personal prayer box'}</dd></div></dl><p className="quiet-copy">You can add a profile picture, description, and recovery contacts after this step.</p><div className="account-flow-actions"><button className="button secondary" onClick={() => {setStep('details');setError('');}}>Back to details</button><button className="button primary" onClick={() => {feedback.prepare();setStep('recovery');}}>Continue</button></div></div>}
      {step === 'recovery' && <div className="account-flow-form"><label>Optional contact<select value={recovery} disabled={verificationStage === 'pending'} onChange={event => {setRecovery(event.target.value as typeof recovery);setVerifiedContacts([]);setVerificationStage('choose');setVerificationError('');}}><option value="none">No email or phone</option><option value="email">Email</option><option value="phone">Phone</option><option value="both">Email and phone</option></select></label>
        {(recovery === 'email' || recovery === 'both') && <label>Email address<input readOnly value="elena@example.invalid" autoComplete="off"/><span className="quiet-copy">{verifiedContacts.includes('email') ? 'Sample verification complete · no real contact saved' : 'Sample only · not verified'}</span></label>}
        {(recovery === 'phone' || recovery === 'both') && <label>Phone number<input readOnly value="+1 (202) 555-0104" autoComplete="off"/><span className="quiet-copy">{verifiedContacts.includes('phone') ? 'Sample verification complete · no real contact saved' : 'Sample only · not verified'}</span></label>}
        {recovery !== 'none' && <details className="account-flow-preview-controls"><summary>Preview contact verification</summary><label>Example state<select value={verificationScenario} disabled={verificationStage === 'pending'} onChange={event => {setVerificationScenario(event.target.value as typeof verificationScenario);setVerificationStage('choose');setVerificationError('');}}><option value="ready">Valid example</option><option value="incorrect">Incorrect code</option><option value="expired">Expired code</option><option value="unavailable">Service unavailable</option></select></label></details>}
        {verificationStage === 'pending' && <p className="account-flow-verification-status" role="status">Preparing an example code… No message is being sent.</p>}
        {verificationStage === 'code' && <form className="account-flow-form account-flow-verification" onSubmit={event => {
          event.preventDefault(); feedback.prepare();
          if (verificationScenario !== 'ready') {setVerificationError(verificationScenario === 'expired' ? 'This example code has expired. Request a fresh example code or skip for now.' : 'That example code is incorrect. Use the correct example or skip for now.');feedback.respond({tone:'info',title:'Please check the sample code.'});return;}
          setVerifiedContacts(contacts => [...contacts.filter(contact => contact !== verificationTarget), verificationTarget]);setVerificationError('');setVerificationStage('verified');feedback.respond({tone:'success',title:'Sample verification complete.',message:'No real contact was verified or saved.'});
        }}><label>Example verification code<input readOnly value={verificationScenario === 'incorrect' ? '00000000' : '24681357'} autoComplete="off" spellCheck={false}/></label><p className="quiet-copy">Fixed design sample for your {verificationTarget}. No email or text message was sent.</p>{verificationError && <p className="account-flow-error" role="alert">{verificationError}</p>}<div className="account-flow-actions"><button className="button primary">Verify example code</button>{verificationError && <button type="button" className="button secondary" onClick={() => {setVerificationScenario('ready');beginVerification(verificationTarget);}}>Retry with a fresh example code</button>}</div></form>}
        {verificationStage === 'failed' && <div className="account-flow-form"><p className="account-flow-error" role="alert">{verificationError}</p><button className="button secondary" onClick={() => {setVerificationScenario('ready');beginVerification(verificationTarget);}}>Retry example verification</button></div>}
        {verificationStage === 'verified' && <p className="account-flow-verification-status" role="status">Sample {verificationTarget} verification complete.{nextContact ? ` You can verify the sample ${nextContact} next, or skip.` : ' You’re ready to continue.'}</p>}
        <div className="account-flow-notice"><Icon name="lock"/><p>Recovery codes give you a way back without email or phone. Keep them somewhere safe; losing your password and every recovery method can mean losing access.</p></div>
        <details className="account-flow-kit"><summary>See an example recovery kit</summary><p>These are design samples, not usable recovery codes.</p><code>PREVIEW-ONLY-1234</code><code>PREVIEW-ONLY-5678</code></details>
        <p className="quiet-copy">Verifying a contact does not enable prayer alerts or marketing. Those are separate, optional choices. No code is sent in this preview.</p>
        <div className="account-flow-actions"><button className="button secondary" onClick={() => setStep('review')}>Back</button>{nextContact ? <button className="button primary" disabled={verificationStage === 'pending' || verificationStage === 'code'} onClick={() => beginVerification(nextContact)}>Verify example {nextContact}</button> : <button className="button primary" onClick={finish}>Explore your Prayer Box</button>}</div>
        {nextContact && <button className="text-link" onClick={finish}>Skip recovery setup for now</button>}
      </div>}
      <button className="text-link account-flow-footer-link" onClick={() => onNavigate('signin')}>Already have an account? Sign in</button>
    </section><aside className="panel account-flow-aside"><Icon name="heart" size={28}/><h2>You can come as you are.</h2><p>Bring your gratitude, questions, and unfinished story.</p><p>We come to the Father through Jesus Christ, with the help of the Holy Spirit.</p><button className="text-link" onClick={() => onNavigate('about')}>About Prayer Box <Icon name="arrow" size={16}/></button></aside></div>
  </div>;
}
