import { useEffect, useId, useRef, useState } from 'react';
import { Modal } from '../ui';
import { screenText } from '../domain';
import { useActionFeedback } from '../action-feedback';
import '../box-description.css';

export function BoxDescriptionEditor({ value, name, onSave, onClose }: {
  value: string; name: string; onSave: (description: string) => void; onClose: () => void;
}) {
  const id = useId();
  const feedback = useActionFeedback();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [confirmExit, setConfirmExit] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const keepEditing = useRef<HTMLButtonElement>(null);
  useEffect(() => { (confirmExit ? keepEditing.current : textarea.current)?.focus({preventScroll:true}); }, [confirmExit]);
  const close = () => draft !== value ? setConfirmExit(true) : onClose();
  return <Modal title={confirmExit ? 'Discard your changes?' : 'Edit box description'} onClose={confirmExit ? () => setConfirmExit(false) : close} closeOnBackdrop>
    {confirmExit ? <div className="box-description-form"><p>Your description has unsaved changes.</p><div className="box-description-actions"><button ref={keepEditing} className="button secondary" onClick={() => setConfirmExit(false)}>Keep editing</button><button className="text-link" onClick={onClose}>Discard changes</button></div></div> : <form className="box-description-form" onSubmit={event => {
      event.preventDefault(); feedback.prepare();
      const next = draft.trim();
      if (next.length > 280) { setError('Keep your description to 280 characters.'); return; }
      const review = next ? screenText(next) : null;
      if (review && review.state !== 'approved') {
        setError(`This description hasn’t been saved. ${review.reason.replace('You can appeal if we misunderstood.', 'Please revise the description before saving.')}`);
        feedback.respond({tone:'info',title:'Please review your description.'});
        return;
      }
      try {
        onSave(next);
        feedback.respond({tone:'success',title:'Your box description is saved.',message:'Saved in this preview until the page reloads.'});
        onClose();
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Your description could not be saved.'); }
    }}>
      <label htmlFor={id}>Description for {name}</label>
      <textarea ref={textarea} id={id} value={draft} maxLength={280} rows={5} onChange={event => {setDraft(event.target.value);setError('');}} aria-invalid={!!error} aria-describedby={`${id}-help ${id}-count${error ? ` ${id}-error` : ''}`} placeholder="Welcome people to your prayer box…" />
      <p className="quiet-copy" id={`${id}-help`}>Visitors will see this on your prayer box. Leave it blank to use the default welcome.</p>
      <span className="quiet-copy" id={`${id}-count`}>{draft.length}/280 characters</span>
      {error && <p className="group-error" id={`${id}-error`} role="alert">{error}</p>}
      <div className="box-description-actions"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className="button primary" disabled={draft === value}>Save description</button></div>
    </form>}
  </Modal>;
}
