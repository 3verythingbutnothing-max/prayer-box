import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelOwnPendingEdit, editOwnStoryText, getStoryPosts, removeOwnEncouragement, storyReportEvidence, formatStoryDate } from './story.ts';
import { canViewRequest, seedRequests } from './domain.ts';
import type { PrayerRequest } from './domain.ts';
const at = '2026-10-28T15:25:00Z';
const fixture = (): PrayerRequest => ({ id: 'delivery-1', sourceId: 'same-source', authorId: 'elena', authorName: 'Elena', recipient: 'maria', anonymous: true, audience: 'private', authorCeiling: 'private', topic: 'Wisdom', text: 'Please pray for wisdom.', createdAt: 'Yesterday', postedAt: '2026-10-27T14:00:00Z', moderation: 'approved', workState: 'new', testimony: { id: 'update-1', kind: 'update', text: 'A little peace.', createdAt: '2026-10-28T09:00:00Z' }, replies: [{ id: 'reply-1', actorId: 'maria', name: 'Maria', text: 'Praying for you.', postedAt: '2026-10-27T15:00:00Z' }, { id: 'child', actorId: 'elena', name: 'Anonymous', parentReplyId: 'reply-1', text: 'Thank you.' }] });
const input = { text: 'Please pray for patience and wisdom.', title: 'A little wisdom', expectedRevision: 1 };

test('an author edits only the selected copy while preserving identity, audience and posting timestamp', () => {
  const row = fixture();
  const other = { ...row, id: 'delivery-2' };
  const result = editOwnStoryText(row, 'elena', {}, input, at);
  assert.equal(result.state, 'saved');
  assert.equal(result.request.editedAt, at);
  assert.equal(result.request.postedAt, row.postedAt);
  assert.equal(result.request.createdAt, row.createdAt);
  assert.equal(result.request.revision, 2);
  for (const key of ['authorId','anonymous','audience','recipient','sourceId','authorCeiling'] as const) assert.equal(result.request[key], row[key]);
  assert.equal(other.text, row.text);
});
test('other users, guests, restricted accounts and stale revisions cannot edit a post', () => {
  const row = fixture();
  for (const viewer of ['maria','guest'] as const) assert.equal(editOwnStoryText(row, viewer, {}, input, at).request, row);
  assert.equal(editOwnStoryText(row, 'elena', {}, input, at, true).state, 'denied');
  assert.equal(editOwnStoryText({ ...row, revision: 2 }, 'elena', {}, input, at).state, 'conflict');
});
test('edits are screened again and held text never replaces the visible approved version', () => {
  const row = fixture();
  const result = editOwnStoryText(row, 'elena', {}, { ...input, text: 'Please send me money on my cashapp $example' }, at);
  assert.equal(result.state, 'pending');
  assert.equal(result.request.text, row.text);
  assert.equal(result.request.topic, row.topic);
  assert.equal(result.request.pendingEdit?.submittedAt, at);
  assert.equal(result.request.editedAt, undefined);
});
test('updates can be corrected without overwriting the original request or moving conversations', () => {
  const row = fixture();
  const result = editOwnStoryText(row, 'elena', { postId: 'update-1' }, { ...input, text: 'A little more peace.' }, at);
  assert.equal(result.state, 'saved');
  assert.equal(result.request.text, row.text);
  assert.deepEqual(result.request.replies, row.replies);
  assert.equal(getStoryPosts(result.request)[0].createdAt, row.testimony?.createdAt);
  assert.equal(getStoryPosts(result.request)[0].editedAt, at);
  assert.equal(getStoryPosts(result.request).length, 1);
  assert.equal(editOwnStoryText(row, 'elena', { postId: 'different-copy-post' }, input, at).state, 'denied');
});
test('only the writer can edit encouragement, in its exact story part; automatic welcomes cannot be edited', () => {
  const row = fixture();
  const target = { replyId: 'reply-1' };
  const result = editOwnStoryText(row, 'maria', target, input, at);
  assert.equal(result.state, 'saved');
  assert.equal(result.request.replies[0].editedAt, at);
  assert.equal(result.request.replies[0].postedAt, row.replies[0].postedAt);
  assert.equal(editOwnStoryText(row, 'elena', target, input, at).state, 'denied');
  assert.equal(editOwnStoryText(row, 'maria', { ...target, postId: 'update-1' }, input, at).state, 'denied');
  assert.equal(editOwnStoryText({ ...row, replies: [{ ...row.replies[0], automatic: true }] }, 'maria', target, input, at).state, 'denied');
});
test('deleting own encouragement removes its text but preserves others replies and rejects forged scope', () => {
  const row = fixture();
  const result = removeOwnEncouragement(row, 'maria', { replyId: 'reply-1' }, at);
  assert.equal(result.replies[0].text, '');
  assert.equal(result.replies[0].deletedAt, at);
  assert.equal(storyReportEvidence(result, 'maria', 'reply-1'), null);
  assert.deepEqual(result.replies[1], row.replies[1]);
  assert.equal(removeOwnEncouragement(row, 'elena', { replyId: 'reply-1' }, at), row);
  assert.equal(removeOwnEncouragement(row, 'maria', { replyId: 'reply-1', postId: 'update-1' }, at), row);
  assert.equal(editOwnStoryText(result, 'maria', { replyId: 'reply-1' }, input, at).state, 'denied');
});
test('unchanged saves and invalid input do not invent edit timestamps', () => {
  const row = fixture();
  assert.equal(editOwnStoryText(row, 'elena', {}, { ...input, text: row.text, title: row.topic }, at).request, row);
  assert.equal(editOwnStoryText(row, 'elena', {}, { ...input, text: ' ' }, at).state, 'invalid');
  assert.equal(editOwnStoryText(row, 'elena', {}, { ...input, text: 'a'.repeat(4001) }, at).state, 'invalid');
  assert.equal(editOwnStoryText(row, 'elena', {}, input, 'invalid').state, 'invalid');
  assert.match(formatStoryDate(at), /\d:\d\d/);
});


test('current approved Grace membership overrides legacy defaults, while authors retain their own delivery', () => {
  const row = { ...fixture(), recipient: 'grace' as const };
  for (const viewer of ['maria','owner','member'] as const) {
    assert.equal(canViewRequest(row, viewer), true);
    assert.equal(canViewRequest(row, viewer, { graceApprovedMemberIds: [] }), false);
    assert.equal(canViewRequest(row, viewer, { graceApprovedMemberIds: [viewer] }), true);
  }
  assert.equal(canViewRequest(row, 'elena', { graceApprovedMemberIds: [] }), true);
  assert.equal(canViewRequest(row, 'guest', { graceApprovedMemberIds: ['guest'] }), false);
});

test('every human encouragement fixture has an explicit synthetic posting timestamp', () => {
  for (const request of seedRequests) for (const reply of request.replies) if (!reply.automatic) {
    assert.ok(reply.postedAt, `${reply.id} needs a fixture date`);
    assert.ok(Number.isFinite(Date.parse(reply.postedAt)));
  }
});


test('only the author can withdraw the selected pending edit without changing published words or dates', () => {
  const row = editOwnStoryText(fixture(), 'elena', {}, { ...input, text: 'Send me money on cashapp $example' }, at).request;
  assert.equal(cancelOwnPendingEdit(row, 'maria', {}, at), row);
  assert.equal(cancelOwnPendingEdit(row, 'elena', {}, 'a-stale-edit-date'), row);
  const cancelled = cancelOwnPendingEdit(row, 'elena', {}, at);
  assert.equal(cancelled.pendingEdit, undefined);
  assert.equal(cancelled.text, row.text);
  assert.equal(cancelled.postedAt, row.postedAt);
  assert.equal(cancelled.editedAt, row.editedAt);
});
