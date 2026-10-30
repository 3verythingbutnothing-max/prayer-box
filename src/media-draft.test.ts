import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyMediaDraft, hasMedia, maxAudioSeconds, mediaDraftReducer as reduce, mediaReady, mediaSummary, sampleMediaTranscript } from './media-draft.ts';
import type { MediaDraftAction, MediaDraftSnapshot } from './media-draft.ts';

const act = (state: MediaDraftSnapshot, ...actions: MediaDraftAction[]) => actions.reduce(reduce,state);
const recorded = () => act(emptyMediaDraft(),{type:'request',permission:'microphone'},{type:'permission',result:'allow'},{type:'tick'},{type:'stop'});
const transcribed = () => act(recorded(),{type:'prepare'},{type:'uploaded'},{type:'transcribed'});

test('empty media is submittable and has no hidden attachments or device references', () => {
  const draft=emptyMediaDraft();
  assert.equal(hasMedia(draft),false);assert.equal(mediaReady(draft),true);assert.equal(mediaSummary(draft),'No attachments');
  assert.equal(JSON.stringify(draft).includes('blob:'),false);
});
test('camera and library previews cap photos at three without altering audio', () => {
  let state=recorded();
  for(let i=0;i<4;i++)state=act(state,{type:'request',permission:i%2?'camera':'library'},{type:'permission',result:'allow'});
  assert.equal(state.photos.length,3);assert.equal(new Set(state.photos.map(photo=>photo.id)).size,3);assert.equal(state.audio?.stage,'preview');
  assert.deepEqual(state.photos.map(photo=>photo.source),['library','camera','library']);
  const removed=reduce(state,{type:'remove_photo',id:state.photos[0].id});
  const added=act(removed,{type:'request',permission:'camera'},{type:'permission',result:'allow'});
  assert.equal(added.photos.length,3);assert.equal(added.photos.at(-1)?.id,'sample-photo-4');
});
test('permission denial and cancellation preserve selected photos and never start recording', () => {
  const photo=act(emptyMediaDraft(),{type:'request',permission:'library'},{type:'permission',result:'allow'});
  for(const result of ['deny','cancel'] as const){
    const state=act(photo,{type:'request',permission:'microphone'},{type:'permission',result});
    assert.deepEqual(state.photos,photo.photos);assert.equal(state.audio,null);assert.equal(state.permission,null);assert.equal(mediaReady(state),true);
  }
});
test('opening a permission preview blocks submission until it is resolved', () => {
  const state=reduce(emptyMediaDraft(),{type:'request',permission:'camera'});
  assert.equal(mediaReady(state),false);assert.equal(state.photos.length,0);
  assert.equal(reduce(emptyMediaDraft(),{type:'permission',result:'allow'}).audio,null);
});
test('recording reaches the three-minute cap and cannot keep growing', () => {
  let state=act(emptyMediaDraft(),{type:'request',permission:'microphone'},{type:'permission',result:'allow'});
  for(let i=0;i<maxAudioSeconds+20;i++)state=reduce(state,{type:'tick'});
  assert.equal(state.audio?.seconds,180);assert.equal(state.audio?.stage,'preview');assert.equal(mediaReady(state),false);
  assert.equal(reduce(state,{type:'tick'}),state);
});
test('a second recording cannot silently replace an existing draft', () => {
  const state=recorded();const next=reduce(state,{type:'request',permission:'microphone'});
  assert.deepEqual(next.audio,state.audio);assert.equal(next.permission,null);
});
test('upload and transcription are ordered, and unconfirmed text cannot be shared', () => {
  const state=recorded();assert.equal(reduce(state,{type:'transcribed'}),state);
  const uploading=reduce(state,{type:'prepare'});assert.equal(uploading.audio?.stage,'uploading');assert.equal(mediaReady(uploading),false);
  const processed=act(uploading,{type:'uploaded'},{type:'transcribed'});
  assert.equal(processed.audio?.transcript,sampleMediaTranscript);assert.equal(processed.audio?.originalTranscript,sampleMediaTranscript);
  assert.equal(mediaReady(processed),false);assert.equal(reduce(processed,{type:'review'}),processed);
  const confirmed=reduce(processed,{type:'confirm'});assert.equal(mediaReady(confirmed),true);
  assert.equal(reduce(confirmed,{type:'review'}).audio?.stage,'review');
});
test('transcript edits invalidate confirmation while retaining the original machine text', () => {
  const checked=reduce(transcribed(),{type:'confirm'});
  const edited=reduce(checked,{type:'edit_transcript',text:'Father, give us wisdom. Amen.'});
  assert.equal(edited.audio?.stage,'confirming');assert.equal(edited.audio?.revision,2);assert.equal(edited.audio?.confirmedRevision,null);
  assert.equal(edited.audio?.originalTranscript,sampleMediaTranscript);assert.equal(mediaReady(edited),false);
  assert.equal(mediaReady(reduce(edited,{type:'confirm'})),true);
  const empty=reduce(edited,{type:'edit_transcript',text:'   '});assert.equal(mediaReady(reduce(empty,{type:'confirm'})),false);
});
test('failed processing preserves audio/photos and retries only the failed stage', () => {
  const photo=act(recorded(),{type:'request',permission:'library'},{type:'permission',result:'allow'});
  for(const at of ['uploading','transcribing'] as const){
    let state=reduce(photo,{type:'prepare'});if(at==='transcribing')state=reduce(state,{type:'uploaded'});
    const failed=reduce(state,{type:'fail',at});assert.equal(failed.audio?.stage,'failed');assert.equal(mediaReady(failed),false);
    assert.equal(failed.audio?.seconds,photo.audio?.seconds);assert.deepEqual(failed.photos,photo.photos);
    assert.equal(reduce(failed,{type:'retry'}).audio?.stage,at);
  }
  assert.equal(reduce(photo,{type:'fail',at:'transcribing'}),photo);
});
test('interruption retains the sample until discard or explicit processing', () => {
  const state=reduce(recorded(),{type:'interrupt'});assert.equal(state.audio?.stage,'interrupted');assert.equal(mediaReady(state),false);
  assert.equal(reduce(state,{type:'prepare'}).audio?.stage,'uploading');
  assert.equal(reduce(state,{type:'discard_audio'}).audio,null);
});
test('held review cannot be altered or treated as published media', () => {
  const held=act(transcribed(),{type:'confirm'},{type:'review'});
  assert.equal(reduce(held,{type:'edit_transcript',text:'replacement'}),held);
  assert.match(mediaSummary(held),/human review required/);
  assert.equal('published' in held,false);assert.equal('url' in held,false);
});
test('independent drafts and reset do not mutate another conversation', () => {
  const initial=emptyMediaDraft(),copy=structuredClone(initial);
  const first=act(initial,{type:'request',permission:'library'},{type:'permission',result:'allow'});
  assert.deepEqual(initial,copy);assert.equal(emptyMediaDraft().photos.length,0);
  assert.deepEqual(reduce(first,{type:'reset'}),emptyMediaDraft());
});
