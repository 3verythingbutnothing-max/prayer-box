import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrayerRequest } from './domain.ts';
import { emptyMediaDraft, mediaDraftReducer as reduce } from './media-draft.ts';
import { approveMediaReply, cancelMediaReply, mediaReplyEligibility, queueMediaReply } from './media-reply-review.ts';
import type { HeldMediaReply, MediaReplyContext, MediaReplyDraft } from './media-reply-review.ts';
import { groupPeople, initialPrayerGroups } from './prayer-groups.ts';
import { hasPrayedForLatest, storyRevision } from './story.ts';

const now = '2026-10-30T12:00:00Z';
const photo = () => reduce(reduce(emptyMediaDraft(), { type: 'request', permission: 'library' }), { type: 'permission', result: 'allow' });
function request(): PrayerRequest { return { id: 'delivery-1', sourceId: 'story-1', authorId: 'nora', authorName: 'Nora', recipient: 'maria', anonymous: false, audience: 'public', text: 'Please pray for wisdom.', topic: 'Wisdom', createdAt: now, postedAt: now, moderation: 'approved', workState: 'new', posts: [{ id: 'update-1', text: 'Still praying.', kind: 'update', createdAt: now }], replies: [{ id: 'encouragement-1', actorId: 'maria', name: 'Maria', text: 'Praying with you.', testimonyId: 'update-1', postedAt: now }] }; }
function setup() {
  const row = request();
  const context: MediaReplyContext = { requests: [row], groups: initialPrayerGroups(), restricted: [], blocks: [], removedByBox: {}, access: { boxCeilings: { maria: 'public', grace: 'public' } } };
  const draft: MediaReplyDraft = { requestId: row.id, actorId: 'elena', postId: 'update-1', parentReplyId: 'encouragement-1', text: 'Father, give wisdom. Amen.', media: photo(), storyRevision: storyRevision(row), byline: 'Elena', official: false, membershipRequired: false };
  return { row, context, draft };
}
function queue(draft: MediaReplyDraft, context: MediaReplyContext): HeldMediaReply[] { const result = queueMediaReply([], draft, context, 'held-1', now); assert.equal(result.ok, true, result.message); return result.queue; }

test('queued media is immutable, does not add a reply, and deduplicates exact author/post/parent scope', () => {
  const { row, context, draft } = setup(); const before = structuredClone(context); const held = queue(draft, context);
  assert.deepEqual(context, before); assert.equal(row.replies.length, 1); assert.equal(hasPrayedForLatest(row, 'elena'), false);
  draft.media.photos.length = 0; assert.equal(held[0].media.photos.length, 1);
  const duplicate = queueMediaReply(held, { ...draft, media: photo(), text: 'Different replacement' }, context, 'held-2', now);
  assert.equal(duplicate.state, 'duplicate'); assert.equal(duplicate.queue.length, 1); assert.equal(duplicate.queue[0].text, 'Father, give wisdom. Amen.');
  assert.equal(queueMediaReply(held, { ...draft, media: photo(), parentReplyId: undefined }, context, 'held-3', now).queue.length, 2);
});
test('human approval attaches checked media to exact delivery, post and parent; only then counts as prayed', () => {
  const { row, context, draft } = setup(); context.requests = [row, { ...structuredClone(row), id: 'other-delivery' }];
  const held = queue(draft, context); const result = approveMediaReply(held, 'held-1', 'operator', context, 'approved-reply', now);
  assert.equal(result.ok, true); assert.equal(result.queue.length, 0); assert.equal(row.replies.length, 1);
  const reply = result.requests[0].replies.at(-1)!;
  assert.equal(reply.testimonyId, 'update-1'); assert.equal(reply.parentReplyId, 'encouragement-1'); assert.equal(reply.mediaReview, 'approved'); assert.equal(reply.previewMedia?.photos.length, 1);
  assert.equal(result.requests[1].replies.length, 1); assert.equal(hasPrayedForLatest(result.requests[0], 'elena'), true);
});
test('deleted, removed or unapproved original deliveries cannot be released', () => {
  for (const state of ['deleted', 'removed', 'pending'] as const) {
    const { row, context, draft } = setup(); const held = queue(draft, context);
    if (state === 'deleted') context.requests = [];
    if (state === 'removed') context.removedByBox = { maria: ['nora'] };
    if (state === 'pending') row.moderation = 'pending';
    const result = approveMediaReply(held, 'held-1', 'operator', context, 'reply', now);
    assert.equal(result.ok, false, state); assert.equal(result.queue.length, 1); assert.equal(row.replies.length, 1);
  }
});
test('post removal, reply deletion and scope changes never retarget held responses', () => {
  for (const change of ['post', 'parent', 'scope', 'duplicate-parent'] as const) {
    const { row, context, draft } = setup(); const held = queue(draft, context);
    if (change === 'post') row.posts = [];
    if (change === 'parent') row.replies[0].deletedAt = now;
    if (change === 'scope') row.replies[0].testimonyId = undefined;
    if (change === 'duplicate-parent') row.replies.push({ ...row.replies[0] });
    const result = approveMediaReply(held, 'held-1', 'operator', context, 'reply', now);
    assert.equal(result.ok, false, change); assert.equal(result.queue[0].postId, 'update-1');
  }
});
test('current restrictions and blocks in either direction stop approval', () => {
  for (const target of ['nora', 'maria']) for (const reverse of [true, false]) {
    const { context, draft } = setup(); const held = queue(draft, context);
    context.blocks = [{ blockerId: reverse ? target : 'elena', blockedId: reverse ? 'elena' : target }];
    assert.equal(approveMediaReply(held, 'held-1', 'operator', context, 'reply', now).ok, false);
  }
  const { context, draft } = setup(); const held = queue(draft, context); context.restricted = ['elena'];
  assert.equal(approveMediaReply(held, 'held-1', 'operator', context, 'reply', now).ok, false);
});
test('current membership, official permission and group closure are checked again', () => {
  for (const change of ['left', 'inactive', 'official', 'closed'] as const) {
    const { row, context, draft } = setup(); row.recipient = 'grace';
    const group = context.groups.find(group => group.id === 'grace')!;
    group.members.push({ ...groupPeople.find(person => person.id === 'elena')!, status: 'approved', role: 'member', joinedAt: 1, updatedAt: 1 });
    const member = group.members.find(member => member.id === 'elena')!;
    member.status = 'approved'; member.active = true; member.officialReply = true;
    context.access.graceApprovedMemberIds = group.members.filter(member => member.status === 'approved' && member.active).map(member => member.id);
    draft.membershipRequired = true; draft.official = true; const held = queue(draft, context);
    if (change === 'left') member.status = 'left';
    if (change === 'inactive') member.active = false;
    if (change === 'official') member.officialReply = false;
    if (change === 'closed') group.archivedAt = 1;
    assert.equal(approveMediaReply(held, 'held-1', 'operator', context, 'reply', now).ok, false, change);
  }
});
test('privacy changes and blocked ancestry revoke pending reply eligibility', () => {
  const { row, context, draft } = setup(); const held = queue(draft, context);
  row.audience = 'private'; assert.equal(approveMediaReply(held, 'held-1', 'operator', context, 'reply', now).ok, false);
  row.audience = 'public';
  row.replies.unshift({ id: 'ancestor', actorId: 'owner', name: 'Owner', text: 'Prayer', testimonyId: 'update-1' });
  row.replies[1].parentReplyId = 'ancestor'; context.blocks = [{ blockerId: 'elena', blockedId: 'owner' }];
  assert.equal(approveMediaReply(held, 'held-1', 'operator', context, 'reply', now).ok, false);
});
test('reviewer role, changes and repeat approval fail closed', () => {
  const { context, draft } = setup(); const held = queue(draft, context);
  assert.equal(approveMediaReply(held, 'held-1', 'elena', context, 'reply', now).ok, false);
  assert.equal(approveMediaReply([{ ...held[0], state: 'changes' }], 'held-1', 'operator', context, 'reply', now).ok, false);
  const approved = approveMediaReply(held, 'held-1', 'operator', context, 'reply', now);
  const repeated = approveMediaReply(approved.queue, 'held-1', 'operator', { ...context, requests: approved.requests }, 'reply-2', now);
  assert.equal(repeated.ok, false); assert.equal(repeated.requests[0].replies.length, 2);
});
test('a newer author update does not move an older approved response into My Prayers', () => {
  const { row, context, draft } = setup(); const held = queue(draft, context);
  row.posts!.push({ id: 'update-2', text: 'New chapter', kind: 'testimony', createdAt: now });
  const approved = approveMediaReply(held, 'held-1', 'operator', context, 'reply', now);
  assert.equal(approved.ok, true); assert.equal(approved.requests[0].replies.at(-1)?.storyRevision, draft.storyRevision);
  assert.equal(hasPrayedForLatest(approved.requests[0], 'elena'), false);
});
test('only response author can cancel; unconfirmed media and self encouragement cannot enter queue', () => {
  const { row, context, draft } = setup(); const held = queue(draft, context);
  assert.equal(cancelMediaReply(held, 'held-1', 'maria').length, 1); assert.equal(cancelMediaReply(held, 'held-1', 'elena').length, 0);
  assert.equal(mediaReplyEligibility({ ...draft, media: emptyMediaDraft() }, context).ok, false);
  assert.equal(mediaReplyEligibility({ ...draft, actorId: 'maria', parentReplyId: undefined }, { ...context, requests: [{ ...row, authorId: 'maria' }] }).ok, false);
});

test('media responses use the same 5000 character boundary as the composer', () => {
  const { context, draft } = setup();
  assert.equal(mediaReplyEligibility({ ...draft, text: 'a'.repeat(5000) }, context).ok, true);
  assert.equal(mediaReplyEligibility({ ...draft, text: 'a'.repeat(5001) }, context).ok, false);
});
