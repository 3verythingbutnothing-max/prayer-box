/** Fictional design state only. No file, microphone, upload, provider or playback. */
export type AudioStage = 'recording' | 'preview' | 'uploading' | 'transcribing' | 'confirming' | 'confirmed' | 'review' | 'failed' | 'interrupted';
export type MediaAudioDraft = {
  stage: AudioStage;
  seconds: number;
  transcript: string;
  originalTranscript: string;
  revision: number;
  confirmedRevision: number | null;
  retryStage?: 'uploading' | 'transcribing';
};
export type MediaDraftSnapshot = {
  photos: { id: string; source: 'camera' | 'library' }[];
  audio: MediaAudioDraft | null;
  permission: 'camera' | 'microphone' | 'library' | null;
  message: string;
  nextPhoto: number;
};
export type MediaDraftAction =
  | { type: 'request'; permission: NonNullable<MediaDraftSnapshot['permission']> }
  | { type: 'permission'; result: 'allow' | 'deny' | 'cancel' }
  | { type: 'remove_photo'; id: string }
  | { type: 'tick' | 'stop' | 'discard_audio' | 'prepare' | 'uploaded' | 'transcribed' | 'confirm' | 'review' | 'retry' | 'interrupt' }
  | { type: 'edit_transcript'; text: string }
  | { type: 'fail'; at: 'uploading' | 'transcribing' }
  | { type: 'reset' };

export const sampleMediaTranscript = 'Father, please give us wisdom for today and peace as we take the next step. Help us trust you, through Jesus Christ, with the help of the Holy Spirit. Amen.';
export const maxAudioSeconds = 180;
export const maxMediaPhotos = 3;
export function emptyMediaDraft(): MediaDraftSnapshot {
  return { photos: [], audio: null, permission: null, message: '', nextPhoto: 1 };
}
export function hasMedia(value: MediaDraftSnapshot): boolean { return value.photos.length > 0 || value.audio !== null; }
export function mediaReady(value: MediaDraftSnapshot): boolean {
  return value.permission === null && (!value.audio || ['confirmed', 'review'].includes(value.audio.stage) && value.audio.confirmedRevision === value.audio.revision && Boolean(value.audio.transcript.trim()));
}
export function mediaSummary(value: MediaDraftSnapshot): string {
  const parts = [value.photos.length ? `${value.photos.length} sample photo${value.photos.length === 1 ? '' : 's'}` : '', value.audio ? `sample audio · ${Math.floor(value.audio.seconds / 60)}:${String(value.audio.seconds % 60).padStart(2, '0')}` : ''].filter(Boolean);
  return parts.length ? `${parts.join(' · ')} · human review required` : 'No attachments';
}
function addPhoto(state: MediaDraftSnapshot, source: 'camera' | 'library'): MediaDraftSnapshot {
  if (state.photos.length >= maxMediaPhotos) return { ...state, permission: null, message: 'You can add up to three photos. Remove one to choose another.' };
  return { ...state, permission: null, photos: [...state.photos, { id: `sample-photo-${state.nextPhoto}`, source }], nextPhoto: state.nextPhoto + 1, message: 'Sample photo added. It will stay private until human review.' };
}
export function mediaDraftReducer(state: MediaDraftSnapshot, action: MediaDraftAction): MediaDraftSnapshot {
  if (action.type === 'reset') return emptyMediaDraft();
  if (action.type === 'request') {
    if (state.audio && ['recording', 'uploading', 'transcribing'].includes(state.audio.stage)) return state;
    if (action.permission === 'microphone' && state.audio) return { ...state, message: 'Discard the current sample recording before recording another.' };
    if (action.permission !== 'microphone' && state.photos.length >= maxMediaPhotos) return { ...state, message: 'You can add up to three photos. Remove one to choose another.' };
    return { ...state, permission: action.permission, message: '' };
  }
  if (action.type === 'permission') {
    if (!state.permission) return state;
    if (action.result !== 'allow') return { ...state, permission: null, message: action.result === 'deny' ? 'Permission declined in this preview. Your draft is safe; you can use text or try another attachment.' : 'Selection cancelled. Your draft is unchanged.' };
    if (state.permission !== 'microphone') return addPhoto(state, state.permission === 'camera' ? 'camera' : 'library');
    return { ...state, permission: null, audio: { stage: 'recording', seconds: 0, transcript: '', originalTranscript: '', revision: 0, confirmedRevision: null }, message: 'Recording simulation started. No microphone is open.' };
  }
  if (action.type === 'remove_photo') return { ...state, photos: state.photos.filter(photo => photo.id !== action.id), message: 'Sample photo removed.' };
  if (action.type === 'discard_audio') return { ...state, audio: null, message: 'Sample recording discarded. Your photos and written draft are unchanged.' };
  const audio = state.audio;
  if (!audio) return state;
  switch (action.type) {
    case 'tick': {
      if (audio.stage !== 'recording') return state;
      const seconds = Math.min(audio.seconds + 1, maxAudioSeconds);
      return { ...state, audio: { ...audio, seconds, stage: seconds === maxAudioSeconds ? 'preview' : 'recording' }, message: seconds === maxAudioSeconds ? 'Three-minute limit reached. The sample recording stopped.' : state.message };
    }
    case 'stop': return audio.stage === 'recording' ? { ...state, audio: { ...audio, seconds: Math.max(1, audio.seconds), stage: 'preview' }, message: 'Sample recording stopped. Review the playback design or prepare its sample transcript.' } : state;
    case 'prepare': return ['preview', 'interrupted'].includes(audio.stage) ? { ...state, audio: { ...audio, stage: 'uploading' }, message: 'Previewing private upload. No audio is being sent.' } : state;
    case 'uploaded': return audio.stage === 'uploading' ? { ...state, audio: { ...audio, stage: 'transcribing' }, message: 'Previewing transcription. No service is connected.' } : state;
    case 'transcribed': return audio.stage === 'transcribing' ? { ...state, audio: { ...audio, stage: 'confirming', transcript: sampleMediaTranscript, originalTranscript: sampleMediaTranscript, revision: 1, confirmedRevision: null }, message: 'Sample transcript ready. Check its words before submitting for human review.' } : state;
    case 'edit_transcript': return ['confirming', 'confirmed'].includes(audio.stage) ? { ...state, audio: { ...audio, stage: 'confirming', transcript: action.text.slice(0, 5000), revision: audio.revision + 1, confirmedRevision: null }, message: 'Transcript changed. Check it again before submitting.' } : state;
    case 'confirm': return audio.stage === 'confirming' && audio.transcript.trim() ? { ...state, audio: { ...audio, stage: 'confirmed', confirmedRevision: audio.revision }, message: 'Sample transcript checked. Audio and transcript are ready to submit for human review.' } : state;
    case 'review': return mediaReady(state) ? { ...state, audio: { ...audio, stage: 'review' }, message: 'Awaiting human review · not shared. This is a fictional review state.' } : state;
    case 'fail': return audio.stage === action.at ? { ...state, audio: { ...audio, stage: 'failed', retryStage: action.at }, message: action.at === 'uploading' ? 'Sample upload interrupted. The recording and draft are still here.' : 'Sample transcription unavailable. The recording and draft are still here; retry or use text.' } : state;
    case 'retry': return audio.stage === 'failed' ? { ...state, audio: { ...audio, stage: audio.retryStage ?? 'uploading' }, message: 'Retrying this sample only. No duplicate prayer is created.' } : state;
    case 'interrupt': return ['recording', 'preview'].includes(audio.stage) ? { ...state, audio: { ...audio, stage: 'interrupted', seconds: Math.max(audio.seconds, 1) }, message: 'Recording interrupted in this preview. The sample is kept for review; nothing was uploaded.' } : state;
    default: return state;
  }
}
