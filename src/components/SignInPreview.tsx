import { useState } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import '../account-flow-preview.css';

export function SignInPreview({ onNavigate, onSignIn }: { onNavigate: (route: string) => void; onSignIn: () => void }) {
  const feedback = useActionFeedback();
  const [scenario, setScenario] = useState<'ready' | 'incorrect' | 'unavailable'>('ready');
  const [error, setError] = useState('');
  return <div className="account-flow-preview"><header className="account-flow-heading"><p className="eyebrow">A little space for prayer</p><h1>Welcome back.</h1><p>Return to your prayers and the people you pray with.</p></header><section className="panel account-flow-card account-signin-preview-card">
    <span className="chip">Design preview</span><p className="account-flow-sample-note"><Icon name="lock" size={17}/><span>Sample credentials are read-only. Real sign-in is still closed.</span></p>
    <form className="account-flow-form" onSubmit={event => {
      event.preventDefault(); feedback.prepare();
      if (scenario !== 'ready') {const message = scenario === 'incorrect' ? 'The username or password is incorrect. Try again, or recover your account.' : 'We could not sign you in. Please try again; your account has not been changed.';setError(message);feedback.respond({tone:'info',title:'Sign-in needs another try.'});return;}
      onSignIn();feedback.respond({tone:'success',title:'Your Prayer Box preview is open.',message:'No real account was signed in.'});
    }}>
      <label>Username<input value="elena" readOnly autoComplete="off" spellCheck={false}/></label><label>Password<input value="prayer-box-preview" type="password" readOnly autoComplete="off"/></label>
      <button className="text-link account-flow-footer-link" type="button" onClick={() => onNavigate('recovery')}>Forgot password?</button>
      <details className="account-flow-preview-controls"><summary>Preview a sign-in state</summary><label>Example state<select value={scenario} onChange={event => {setScenario(event.target.value as typeof scenario);setError('');}}><option value="ready">Ready to sign in</option><option value="incorrect">Incorrect credentials</option><option value="unavailable">Connection unavailable</option></select></label></details>
      {error && <p className="account-flow-error" role="alert">{error}</p>}<button className="button primary">Open account preview</button>
    </form><button className="text-link account-flow-footer-link" onClick={() => onNavigate('signup')}>Create your Prayer Box</button>
  </section></div>;
}
