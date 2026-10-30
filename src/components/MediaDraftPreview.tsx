import { useEffect, useId, useReducer, useRef, useState } from 'react';
import { Icon } from '../ui';
import { useActionFeedback } from '../action-feedback';
import { emptyMediaDraft, maxMediaPhotos, mediaDraftReducer, mediaReady, mediaSummary } from '../media-draft';
import type { MediaDraftSnapshot } from '../media-draft';
import '../media-draft-preview.css';

export type MediaDraftPreviewProps = {
  context?: string;
  onChange?: (snapshot: MediaDraftSnapshot) => void;
  disabled?: boolean;
  resetKey?: string | number;
  initialSnapshot?: MediaDraftSnapshot;
};

/** Interactive fictional media walkthrough. Never asks for or reads a device/file. */
export function MediaDraftPreview({ context = 'prayer request', onChange, disabled = false, resetKey, initialSnapshot }: MediaDraftPreviewProps) {
  const [state, dispatch] = useReducer(mediaDraftReducer, initialSnapshot, value => value ?? emptyMediaDraft());
  const [playbackPreview, setPlaybackPreview] = useState(false);
  const [failure, setFailure] = useState<'none' | 'uploading' | 'transcribing'>('none');
  const failNext = useRef(false);
  const change = useRef(onChange);
  change.current = onChange;
  const feedback = useActionFeedback();
  const id = useId();
  const permissionHeading = useRef<HTMLHeadingElement>(null);
  const audioHeading = useRef<HTMLHeadingElement>(null);
  const permissionTrigger = useRef<HTMLElement | null>(null);
  const previousPermission = useRef(state.permission);
  const previousAudioStage = useRef(state.audio?.stage);
  const transcript = useRef<HTMLTextAreaElement>(null);
  const recordTrigger = useRef<HTMLButtonElement>(null);
  const choosePhotosTrigger = useRef<HTMLButtonElement>(null);
  const removePhotoTriggers = useRef(new Map<string, HTMLButtonElement>());
  const restoreRecordFocus = useRef(false);
  const previousReset = useRef(resetKey);
  useEffect(() => { change.current?.(state); }, [state]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    dispatch({ type: 'reset' }); setPlaybackPreview(false); setFailure('none'); failNext.current = false;
  }, [resetKey]);
  useEffect(() => {
    if (state.permission) permissionHeading.current?.focus({ preventScroll: true });
    else if (previousPermission.current) {
      if (permissionTrigger.current?.isConnected) permissionTrigger.current.focus({ preventScroll: true });
      else audioHeading.current?.focus({ preventScroll: true });
    }
    previousPermission.current = state.permission;
  }, [state.permission]);
  useEffect(() => {
    if (state.audio?.stage === 'confirming' && previousAudioStage.current === 'transcribing') transcript.current?.focus({ preventScroll: true });
    if (state.audio && state.audio.stage !== 'recording' && previousAudioStage.current === 'recording') audioHeading.current?.focus({ preventScroll: true });
    if (['uploading', 'failed', 'interrupted'].includes(state.audio?.stage ?? '') && document.activeElement === document.body) audioHeading.current?.focus({ preventScroll: true });
    if (!state.audio && restoreRecordFocus.current) {
      restoreRecordFocus.current = false;
      recordTrigger.current?.focus({ preventScroll: true });
    }
    previousAudioStage.current = state.audio?.stage;
  }, [state.audio?.stage]);
  useEffect(() => {
    if (state.audio?.stage !== 'recording') return;
    const timer = window.setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => window.clearInterval(timer);
  }, [state.audio?.stage]);
  useEffect(() => {
    const stage = state.audio?.stage;
    if (stage !== 'uploading' && stage !== 'transcribing') return;
    const timer = window.setTimeout(() => {
      if (failNext.current && failure === stage) { failNext.current = false; dispatch({ type: 'fail', at: stage }); }
      else dispatch({ type: stage === 'uploading' ? 'uploaded' : 'transcribed' });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state.audio?.stage, failure]);

  const audio = state.audio;
  const busy = audio?.stage === 'recording' || audio?.stage === 'uploading' || audio?.stage === 'transcribing';
  const duration = `${Math.floor((audio?.seconds ?? 0) / 60)}:${String((audio?.seconds ?? 0) % 60).padStart(2, '0')}`;
  const request = (permission: NonNullable<MediaDraftSnapshot['permission']>) => { permissionTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPlaybackPreview(false); dispatch({ type: 'request', permission }); };
  const prepare = () => { failNext.current = failure !== 'none'; setPlaybackPreview(false); dispatch({ type: 'prepare' }); };
  const permissionName = state.permission === 'microphone' ? 'Microphone' : state.permission === 'camera' ? 'Camera' : 'Photo selection';

  return <section className="media-draft-preview" aria-labelledby={`${id}-title`}>
    <div className="media-draft-heading"><h3 id={`${id}-title`}>Add a photo or recorded prayer</h3><span className="media-preview-badge">Design preview</span></div>
    <p className="media-draft-help" id={`${id}-help`}>Try sample attachments for this {context}. No camera, microphone, files, or uploads are opened here.</p>
    <fieldset disabled={disabled} className="media-draft-controls" aria-describedby={`${id}-help`}>
      <legend className="sr-only">Attachments for this {context}</legend>
      <div className="media-draft-toolbar">
        <button type="button" className="button secondary compact" disabled={busy || state.photos.length >= maxMediaPhotos} onClick={() => request('camera')}><Icon name="photo" size={18}/>Take photo</button>
        <button type="button" ref={choosePhotosTrigger} className="button secondary compact" disabled={busy || state.photos.length >= maxMediaPhotos} onClick={() => request('library')}><Icon name="upload" size={18}/>Choose photos</button>
        {!audio && <button type="button" ref={recordTrigger} className="button secondary compact" onClick={() => request('microphone')}><Icon name="audio" size={18}/>Record prayer</button>}
      </div>
      <p className="media-draft-limits">Up to 3 photos · 5 MiB each. One recording · 3 minutes / 10 MiB.</p>

      {state.permission && <section className="media-permission-preview" role="group" aria-labelledby={`${id}-permission`}>
        <div className="media-permission-symbol"><Icon name={state.permission === 'microphone' ? 'audio' : 'photo'} size={25}/></div>
        <h4 id={`${id}-permission`} ref={permissionHeading} tabIndex={-1}>{permissionName} preview</h4>
        <p>{state.permission === 'microphone' ? `Prayer Box would ask to use your microphone only to record the ${context} you choose to share.` : state.permission === 'camera' ? `Prayer Box would ask to use your camera only when you choose to take a photo for this ${context}.` : 'Your device would show a photo picker. Only pictures you select would be shared; access to your whole library is not needed.'}</p>
        <div className="media-draft-actions"><button type="button" className="button primary" onClick={() => dispatch({ type: 'permission', result: 'allow' })}>{state.permission === 'library' ? 'Use sample photo' : 'Allow in preview'}</button>{state.permission !== 'library' && <button type="button" className="button secondary" onClick={() => dispatch({ type: 'permission', result: 'deny' })}>Don’t allow</button>}<button type="button" className="text-link" onClick={() => dispatch({ type: 'permission', result: 'cancel' })}>Cancel</button></div>
      </section>}

      {state.photos.length > 0 && <ul className="media-sample-photos" aria-label="Selected sample photos">{state.photos.map((photo, index) => <li key={photo.id}><div className="media-sample-photo-art" aria-hidden="true"><Icon name="photo" size={34}/><span>Sample {index + 1}</span></div><div><strong>Sample photo {index + 1}</strong><small>{photo.source === 'camera' ? 'Camera preview' : 'Photo picker preview'} · review required</small></div><button type="button" className="icon-button" ref={element => { if (element) removePhotoTriggers.current.set(photo.id, element); else removePhotoTriggers.current.delete(photo.id); }} aria-label={`Remove sample photo ${index + 1}`} onClick={() => { const nextPhoto = state.photos[index + 1] ?? state.photos[index - 1]; (nextPhoto ? removePhotoTriggers.current.get(nextPhoto.id) : choosePhotosTrigger.current)?.focus({ preventScroll: true }); dispatch({ type: 'remove_photo', id: photo.id }); }}><Icon name="close" size={18}/></button></li>)}</ul>}

      {audio && <section className="media-audio-draft" aria-labelledby={`${id}-audio`}>
        <div className="media-audio-heading"><span className={`media-audio-symbol ${audio.stage === 'recording' ? 'is-recording' : ''}`}><Icon name="audio" size={24}/></span><div><h4 ref={audioHeading} tabIndex={-1} id={`${id}-audio`}>{audio.stage === 'recording' ? 'Recording simulation' : 'Your sample recorded prayer'}</h4><span className="media-audio-time">{duration} / 3:00 · sample timer</span></div></div>
        {audio.stage === 'recording' && <><div className="media-wave-preview" aria-hidden="true">{[12,25,18,37,24,42,17,31,22,39,20,28,15,35,21,30].map((height,index)=><i key={index} style={{height}}/>)}</div><button type="button" className="button secondary" onClick={() => dispatch({ type: 'stop' })}>Stop sample recording</button></>}
        {['preview', 'interrupted'].includes(audio.stage) && <div className="media-draft-actions"><button type="button" className="button secondary" aria-pressed={playbackPreview} onClick={() => setPlaybackPreview(value => !value)}>{playbackPreview ? 'Close playback preview' : 'Preview playback design'}</button><button type="button" className="button primary" onClick={prepare}>Prepare sample transcript</button></div>}
        {playbackPreview && <p className="media-playback-note">This is the playback layout only. No recording exists and no voice is played.</p>}
        {['uploading', 'transcribing'].includes(audio.stage) && <div className="media-processing" role="status"><span className="media-processing-dot" aria-hidden="true"/>{audio.stage === 'uploading' ? 'Previewing private upload…' : 'Preparing the sample transcript…'}<span>No file is sent to a service.</span></div>}
        {['confirming', 'confirmed', 'review'].includes(audio.stage) && <div className="media-transcript-preview"><label htmlFor={`${id}-transcript`}>Transcript</label><p id={`${id}-transcript-help`}>Automatically transcribed in the planned app; it may contain errors. These words are a fictional sample.</p><textarea ref={transcript} id={`${id}-transcript`} value={audio.transcript} maxLength={5000} rows={4} readOnly={audio.stage === 'review'} onChange={event => dispatch({ type: 'edit_transcript', text: event.target.value })} aria-describedby={`${id}-transcript-help`}/><small>Revision {audio.revision}{audio.confirmedRevision === audio.revision ? ' · checked by you' : ' · check before sharing'}</small>{audio.stage === 'confirming' && <button type="button" className="button secondary" disabled={!audio.transcript.trim()} onClick={() => {feedback.prepare();transcript.current?.focus({ preventScroll: true });dispatch({ type: 'confirm' });feedback.respond({tone:'success',title:'Sample transcript checked.',message:'Audio and transcript still need human review before sharing.'});}}>I’ve checked this transcript</button>}{audio.stage === 'confirmed' && <p className="media-ready-note"><Icon name="check" size={18}/>Ready to submit for human review</p>}{audio.stage === 'review' && <p className="media-held-note"><Icon name="lock" size={18}/>Awaiting human review · not shared</p>}</div>}
        {audio.stage === 'failed' && <div className="media-held-note" role="status"><p>{state.message}</p><button type="button" className="button secondary" onClick={() => dispatch({ type: 'retry' })}>Retry sample processing</button><span>Your photos and written draft are unchanged.</span></div>}
        <div className="media-draft-actions"><button type="button" className="text-link" onClick={() => {restoreRecordFocus.current = true;setPlaybackPreview(false);dispatch({ type: 'discard_audio' });}}>Discard sample recording</button></div>
      </section>}

      {(state.photos.length > 0 || audio) && <p className="media-draft-privacy"><Icon name="lock" size={17}/><span>Attachments stay private until review. A photo or voice may identify you even when you post anonymously.</span></p>}
      <p className="media-draft-status" role="status" aria-live="polite">{audio?.stage === 'failed' ? '' : state.message}</p>
      <details className="media-preview-scenarios"><summary>Preview scenarios</summary><p>Fictional states for reviewing this design. No device permissions or services are used.</p><label htmlFor={`${id}-failure`}>Next processing attempt<select id={`${id}-failure`} value={failure} disabled={busy} onChange={event => setFailure(event.target.value as typeof failure)}><option value="none">Sample transcript ready</option><option value="uploading">Upload failure, then successful retry</option><option value="transcribing">Transcription failure, then successful retry</option></select></label><div className="media-draft-actions"><button type="button" className="button secondary compact" disabled={!audio || !['recording', 'preview'].includes(audio.stage)} onClick={() => dispatch({ type: 'interrupt' })}>Preview interruption</button><button type="button" className="button secondary compact" disabled={!audio || !mediaReady(state)} onClick={() => dispatch({ type: 'review' })}>Preview review queue</button></div><p className="media-snapshot-summary">{mediaSummary(state)}. {mediaReady(state) ? 'Ready for the next form step.' : 'Finish or discard the pending attachment before continuing.'}</p></details>
    </fieldset>
  </section>;
}

export default MediaDraftPreview;
