import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { makePicturePreview } from '../picture-preview';
import '../profile-picture.css';

type Props = { name: string; picture?: string; onChange: (picture: string | undefined) => void };

export default function ProfilePictureSettings({ name, picture, onChange }: Props) {
  const feedback = useActionFeedback();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const sequence = useRef(0);
  const [draft, setDraft] = useState<string>();
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => () => { sequence.current++; }, []);

  function discard() {
    sequence.current++;
    setDraft(undefined);
    setReading(false);
    setError('');
    if (fileInput.current) fileInput.current.value = '';
  }

  return <section className="account-settings-section panel profile-picture-settings" aria-labelledby={`${id}-title`}>
    <div className="account-section-top">
      <h2 id={`${id}-title`}>Your profile picture</h2>
      <span className="chip">Optional</span>
    </div>
    <p>Add a little touch of you, whenever you’re ready. You can change or remove your picture anytime.</p>
    <div className="profile-picture-row">
      <div className="profile-picture-preview" role="img" aria-label={draft ? 'New profile picture preview, not yet saved' : picture ? `${name}’s profile picture` : `Default profile picture for ${name}`}>
        {draft || picture ? <img src={draft ?? picture} alt="" /> : <span>{name.slice(0, 1)}</span>}
      </div>
      <div className="profile-picture-controls">
        <button type="button" className="button secondary" aria-describedby={`${id}-help`} onClick={() => fileInput.current?.click()}>
          <Icon name="photo" />{picture || draft ? 'Choose another picture' : 'Choose a picture'}
        </button>
        <input ref={fileInput} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Choose a profile picture" onChange={async event => {
          const input = event.currentTarget;
          const file = input.files?.[0];
          input.value = '';
          if (!file) return;
          const request = ++sequence.current;
          setReading(true); setDraft(undefined); setError('');
          try {
            const next = await makePicturePreview(file);
            if (sequence.current === request) setDraft(next);
          } catch (error) {
            if (sequence.current === request) setError(error instanceof Error && error.name !== 'InvalidStateError' ? error.message : 'That picture could not be opened. Please choose another image.');
          } finally {
            if (sequence.current === request) setReading(false);
          }
        }} />
        <p id={`${id}-help`}>PNG, JPEG, or WebP, up to 2 MB. We’ll center your picture in a square.</p>
      </div>
    </div>
    <div className="profile-picture-status" role="status">
      {reading ? 'Preparing your picture…' : draft ? 'Looking good? Save your picture below.' : ''}
    </div>
    {error && <p className="profile-picture-error" role="alert">{error}</p>}
    <div className="profile-picture-actions">
      {draft && <button type="button" className="button primary" onClick={() => {
        feedback.prepare(); onChange(draft); discard();
        feedback.respond({ tone: 'success', title: 'Profile picture updated.', message: 'Saved for this preview session.' });
      }}><Icon name="check" />Save picture</button>}
      {(draft || reading) && <button type="button" className="button secondary" onClick={discard}>Cancel</button>}
      {picture && <button type="button" className="text-link" onClick={() => {
        feedback.prepare(); discard(); onChange(undefined);
        feedback.respond({ tone: 'success', title: 'Profile picture removed.', message: 'Your initial is showing again.' });
      }}>Remove picture</button>}
    </div>
    <p className="profile-picture-note"><Icon name="lock" size={17} />Only you can see this picture in the current preview. Reloading clears it; sharing and image review aren’t connected yet.</p>
  </section>;
}
