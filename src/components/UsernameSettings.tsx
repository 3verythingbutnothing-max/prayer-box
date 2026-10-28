import { useState } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { normalizeAccountUsername } from '../account-username';

export function UsernameSettings({ username, occupied, onSave, editable = true }: { username:string; occupied:readonly string[]; onSave:(username:string)=>void; editable?:boolean }) {
  const [draft, setDraft] = useState(username);
  const [error, setError] = useState('');
  const feedback = useActionFeedback();
  return <section className="account-settings-section panel username-settings"><h2>Your username</h2><p>People can use your @username to find you. Your existing prayers and connections stay with your account.</p>
    <form onSubmit={event => {event.preventDefault();feedback.prepare();try {const next=normalizeAccountUsername(draft,occupied,username);onSave(next);setDraft(next);setError('');feedback.respond({tone:'success',title:'Your username is saved.',message:'Saved in this preview until the page reloads.'});}catch(failure){const message=failure instanceof Error?failure.message:'Check your username.';setError(message);feedback.respond({tone:'error',title:message});}}}>
      <label htmlFor="profile-username">Username</label><div className="username-edit-row"><span aria-hidden="true">@</span><input id="profile-username" value={draft} disabled={!editable} onChange={event=>setDraft(event.target.value)} maxLength={33} autoCapitalize="none" autoComplete="off" spellCheck={false} required aria-describedby="profile-username-help"/><button className="button secondary" disabled={!editable || draft===username}>Save username <Icon name="check" size={18}/></button></div>
      <p className="quiet-copy" id="profile-username-help">{editable?'3–32 characters. This preview updates name searches; shared box links keep working.':'This platform role uses a fixed username.'}</p>{error&&<p className="group-error" role="alert">{error}</p>}
    </form></section>;
}
