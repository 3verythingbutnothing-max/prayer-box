import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGroupCommand, canModerateGroup, groupNoticesForCommand, groupPeople, initialPrayerGroups, isGroupAdmin, planGroupDeparture, visibleGroupNotices } from './prayer-groups.ts';
import type { GroupCommand, GroupMember, GroupPerson, PrayerGroup } from './prayer-groups.ts';
import { removeGroupContent } from './group-moderation.ts';
import { canViewRequest } from './domain.ts';
import type { PrayerRequest } from './domain.ts';
import { editOwnStoryText, getStoryPosts, storyReportEvidence } from './story.ts';
import { scopedStoryReplies } from './story-replies.ts';

const now = Date.UTC(2026, 9, 28, 12);
const owner = groupPeople.find(person => person.id === 'owner')!;
const maria = groupPeople.find(person => person.id === 'maria')!;
const samuel = groupPeople.find(person => person.id === 'member')!;
const elena = groupPeople.find(person => person.id === 'elena')!;
const jordan = groupPeople.find(person => person.id === 'jordan')!;
const member = (person: GroupPerson, overrides: Partial<GroupMember> = {}): GroupMember => ({
  ...person, status: 'approved', role: 'member', joinedAt: now - 100_000, updatedAt: now - 100_000, ...overrides,
});
function group(): PrayerGroup {
  const value = initialPrayerGroups()[0];
  value.members.find(row => row.id === maria.id)!.role = 'moderator';
  value.members.find(row => row.id === maria.id)!.moderatorSince = now - 30_000;
  return value;
}
const apply = (value: PrayerGroup, actor: GroupPerson, command: GroupCommand, at = now) => applyGroupCommand(value, actor, command, value.version, groupPeople, at);
function request(): PrayerRequest {
  return {
    id: 'group-copy', sourceId: 'same-author-story', recipient: 'grace', authorId: 'elena', authorName: 'Elena',
    anonymous: true, audience: 'private', topic: 'Private original title', text: 'Private original words',
    createdAt: '2026-10-20T12:00:00Z', postedAt: '2026-10-20T12:00:00Z', revision: 2,
    moderation: 'approved', workState: 'new',
    posts: [
      { id: 'first-update', kind: 'update', text: 'Private update words', createdAt: '2026-10-22T12:00:00Z', revision: 3 },
      { id: 'later-testimony', kind: 'testimony', text: 'Private testimony words', createdAt: '2026-10-25T12:00:00Z' },
    ],
    replies: [
      { id: 'original-reply', actorId: 'member', name: 'Samuel', text: 'Original encouragement', postedAt: '2026-10-21T12:00:00Z' },
      { id: 'update-reply', actorId: 'elena', name: 'Anonymous', text: 'Update encouragement', testimonyId: 'first-update', revision: 2 },
      { id: 'child-reply', actorId: 'member', name: 'Samuel', text: 'A response to encouragement', testimonyId: 'first-update', parentReplyId: 'update-reply' },
      { id: 'unrelated-reply', actorId: 'member', name: 'Samuel', text: 'Other update encouragement', testimonyId: 'first-update' },
    ],
  };
}

test('moderators may approve and deny applicants and remove an ordinary member', () => {
  const start = group(); start.members.push(member(elena, { status: 'pending', joinedAt: null }));
  const approved = apply(start, maria, { type: 'approve', targetId: elena.id });
  assert.equal(approved.members.find(row => row.id === elena.id)?.status, 'approved');
  assert.equal(approved.members.find(row => row.id === elena.id)?.officialReply, false);
  assert.equal(apply(start, maria, { type: 'deny', targetId: elena.id }).members.find(row => row.id === elena.id)?.status, 'declined');
  const removed = apply(approved, maria, { type: 'remove', targetId: elena.id });
  assert.equal(removed.members.find(row => row.id === elena.id)?.status, 'left');
  assert.equal(removed.members.find(row => row.id === elena.id)?.joinedAt, null);
  assert.equal(start.members.find(row => row.id === elena.id)?.status, 'pending');
});

test('moderators cannot assign roles, invite, block, configure the group, or grant official voice', () => {
  const start = group();
  const commands: GroupCommand[] = [
    { type: 'set_role', targetId: maria.id, role: 'admin' }, { type: 'set_role', targetId: samuel.id, role: 'moderator' },
    { type: 'promote', targetId: samuel.id }, { type: 'demote', targetId: owner.id },
    { type: 'invite', targetId: elena.id }, { type: 'cancel_invite', targetId: jordan.id },
    { type: 'block', targetId: samuel.id }, { type: 'unblock', targetId: samuel.id },
    { type: 'edit', name: 'Changed', website: '', icon: 'sun' },
    { type: 'set_official_reply', targetId: maria.id, allowed: true }, { type: 'request_deletion' },
  ];
  for (const command of commands) assert.throws(() => apply(start, maria, command), undefined, command.type);
  assert.equal(canModerateGroup(start, maria.id), true);
  assert.equal(isGroupAdmin(start, maria.id), false);
});

test('moderators cannot remove admins, fellow moderators, themselves, or pending applicants', () => {
  const start = group();
  start.members.push(member(elena, { role: 'moderator', moderatorSince: now - 10_000 }));
  start.members.push(member(jordan, { status: 'pending', joinedAt: null }));
  for (const id of [owner.id, maria.id, elena.id, jordan.id]) assert.throws(() => apply(start, maria, { type: 'remove', targetId: id }));
});

test('inactive, pending, removed and archived staff have no moderator powers', () => {
  for (const status of ['pending', 'invited', 'left', 'blocked'] as const) {
    const start = group(); start.members.find(row => row.id === maria.id)!.status = status;
    assert.equal(canModerateGroup(start, maria.id), false);
    assert.throws(() => apply(start, maria, { type: 'remove', targetId: samuel.id }));
  }
  const inactive = group(); inactive.members.find(row => row.id === maria.id)!.active = false;
  assert.equal(canModerateGroup(inactive, maria.id), false);
  assert.throws(() => apply(inactive, maria, { type: 'remove', targetId: samuel.id }));
  const archived = group(); archived.archivedAt = now - 1;
  assert.equal(canModerateGroup(archived, owner.id), false);
});

test('admin assigns moderator with fresh tenure but separate official reply permission', () => {
  const start = group();
  const next = apply(start, owner, { type: 'set_role', targetId: samuel.id, role: 'moderator' });
  const promoted = next.members.find(row => row.id === samuel.id)!;
  assert.equal(promoted.role, 'moderator'); assert.equal(promoted.moderatorSince, now);
  assert.equal(Boolean(promoted.officialReply), false);
  assert.throws(() => apply(next, owner, { type: 'set_role', targetId: samuel.id, role: 'moderator' }));
  assert.throws(() => apply(start, owner, { type: 'set_role', targetId: owner.id, role: 'moderator' }));
});

test('automatic handoff prefers oldest current moderator tenure before longest ordinary membership', () => {
  const start = group();
  start.members.find(row => row.id === samuel.id)!.joinedAt = now - 1_000_000;
  start.members.push(member(elena, { role: 'moderator', joinedAt: now - 500_000, moderatorSince: now - 20_000 }));
  assert.equal(planGroupDeparture(start, owner.id, undefined, now).successor?.id, maria.id);
  const next = apply(start, owner, { type: 'leave' });
  assert.equal(next.ownerId, maria.id); assert.equal(next.members.find(row => row.id === maria.id)?.role, 'admin');
  assert.equal(next.members.find(row => row.id === maria.id)?.moderatorSince, null);
  assert.equal(next.members.find(row => row.id === owner.id)?.officialReply, false);
});

test('moderator demotion and re-promotion resets seniority and departure clears tenure', () => {
  let start = group();
  start.members.push(member(elena, { role: 'moderator', moderatorSince: now - 20_000 }));
  start = apply(start, owner, { type: 'set_role', targetId: maria.id, role: 'member' }, now - 100);
  assert.equal(start.members.find(row => row.id === maria.id)?.moderatorSince, null);
  start = apply(start, owner, { type: 'set_role', targetId: maria.id, role: 'moderator' });
  assert.equal(planGroupDeparture(start, owner.id, undefined, now + 1).successor?.id, elena.id);
  const left = apply(start, maria, { type: 'leave' }, now + 1);
  assert.equal(left.members.find(row => row.id === maria.id)?.moderatorSince, null);
});

test('handoff excludes invalid or future tenure, suspended roles and unapproved people', () => {
  for (const overrides of [
    { active: false }, { status: 'pending' as const }, { status: 'blocked' as const },
    { joinedAt: null }, { joinedAt: NaN }, { joinedAt: now + 1 },
    { moderatorSince: NaN }, { moderatorSince: now + 1 },
  ]) {
    const start = group(); Object.assign(start.members.find(row => row.id === maria.id)!, overrides);
    assert.equal(planGroupDeparture(start, owner.id, undefined, now).successor?.id, samuel.id);
    assert.throws(() => planGroupDeparture(start, owner.id, maria.id, now));
  }
});

test('moderator tenure ties use membership then stable ID; explicit approved successor is honored', () => {
  const start = group(); const senior = start.members.find(row => row.id === maria.id)!;
  start.members.push(member(elena, { role: 'moderator', moderatorSince: senior.moderatorSince, joinedAt: senior.joinedAt }));
  assert.equal(planGroupDeparture(start, owner.id, undefined, now).successor?.id, elena.id);
  assert.equal(planGroupDeparture(start, owner.id, samuel.id, now).successor?.id, samuel.id);
});

test('role and removal notices are private, generic, deterministic and report no actor identity', () => {
  const start = group(); const command: GroupCommand = { type: 'set_role', targetId: samuel.id, role: 'moderator' };
  const next = apply(start, owner, command);
  const notices = groupNoticesForCommand(start, next, owner.id, command);
  assert.equal(notices.length, 1); assert.equal(notices[0].recipientId, samuel.id);
  assert.match(notices[0].title, /moderator/);
  assert.deepEqual(notices, groupNoticesForCommand(start, next, owner.id, command));
  for (const viewer of ['guest', owner.id, maria.id, elena.id]) assert.deepEqual(visibleGroupNotices(notices, viewer), []);
  assert.deepEqual(visibleGroupNotices(notices, samuel.id), notices);
  assert.equal(Object.hasOwn(notices[0], 'actorId'), false);
  const removed = apply(start, maria, { type: 'remove', targetId: samuel.id });
  const removalNotice = groupNoticesForCommand(start, removed, maria.id, { type: 'remove', targetId: samuel.id });
  assert.equal(removalNotice.length, 1); assert.match(removalNotice[0].title, /removed/);
  assert.throws(() => apply(removed, owner, { type: 'remove', targetId: samuel.id }));
});

test('staff notices reject mismatched groups or versions and a handoff informs successor and leaver', () => {
  const start = group(); const next = apply(start, owner, { type: 'leave' });
  const notices = groupNoticesForCommand(start, next, owner.id, { type: 'leave' });
  assert.deepEqual(notices.map(row => [row.recipientId, row.kind]).sort(), [[maria.id, 'role_admin'], [owner.id, 'left']].sort());
  assert.deepEqual(groupNoticesForCommand(start, { ...next, version: next.version + 1 }, owner.id, { type: 'leave' }), []);
  assert.deepEqual(groupNoticesForCommand(start, { ...next, id: 'another-group' }, owner.id, { type: 'leave' }), []);
});

test('removing an original hides only that group copy and sends no private text or anonymous author identity to staff', () => {
  const original = request(); const personalCopy = { ...structuredClone(original), id: 'personal-copy', recipient: 'maria' as const };
  const result = removeGroupContent(original, group(), maria.id, { reason: 'privacy', expectedRevision: 2 }, now);
  assert.ok(result.request.groupRemoval); assert.equal(original.groupRemoval, undefined); assert.equal(personalCopy.groupRemoval, undefined);
  assert.equal(result.request.sourceId, personalCopy.sourceId);
  for (const viewer of ['elena', 'maria', 'owner', 'member', 'guest'] as const) assert.equal(canViewRequest(result.request, viewer), false);
  const notice = result.notice!; assert.equal(notice.recipientId, elena.id); assert.match(notice.title, /moderator/);
  assert.deepEqual(visibleGroupNotices([notice], maria.id), []);
  assert.equal(notice.message.includes(original.text), false); assert.equal(notice.message.includes(original.topic), false);
  assert.equal(Object.hasOwn(result.request.groupRemoval!, 'actorId'), false);
  assert.equal(storyReportEvidence(result.request, elena.id), null);
});

test('moderation checks active group scope, account role, original approval, author identity and revision', () => {
  const original = request(); const input = { reason: 'hate' as const, expectedRevision: 2 };
  assert.throws(() => removeGroupContent(original, group(), samuel.id, input, now));
  assert.throws(() => removeGroupContent({ ...original, recipient: 'maria' }, group(), maria.id, input, now));
  assert.throws(() => removeGroupContent({ ...original, moderation: 'pending' }, group(), maria.id, input, now));
  assert.throws(() => removeGroupContent({ ...original, authorId: maria.id }, group(), maria.id, input, now));
  assert.throws(() => removeGroupContent(original, group(), maria.id, { ...input, expectedRevision: 1 }, now));
  assert.throws(() => removeGroupContent(original, group(), maria.id, { ...input, reason: 'invented' as 'hate' }, now));
});

test('update removal preserves the original and other updates; repeat is a no-op with one notice', () => {
  const original = request(); const input = { postId: 'first-update', reason: 'trinitarian' as const, expectedRevision: 3 };
  const first = removeGroupContent(original, group(), owner.id, input, now);
  assert.equal(first.request.text, original.text); assert.equal(first.request.groupRemoval, undefined);
  assert.deepEqual(getStoryPosts(first.request).map(row => row.id), ['later-testimony']);
  assert.equal(storyReportEvidence(first.request, elena.id, undefined, 'first-update'), null);
  assert.match(first.notice!.title, /update was removed by a group admin/);
  const repeat = removeGroupContent(first.request, group(), owner.id, input, now + 100);
  assert.equal(repeat.request, first.request); assert.equal(repeat.notice, null);
  assert.throws(() => removeGroupContent(first.request, group(), owner.id, { postId: 'first-update', replyId: 'update-reply', reason: 'hate', expectedRevision: 2 }, now));
});

test('encouragement removal hides its descendants but preserves other conversations', () => {
  const original = request(); const input = { postId: 'first-update', replyId: 'update-reply', reason: 'harassment' as const, expectedRevision: 2 };
  const next = removeGroupContent(original, group(), maria.id, input, now);
  assert.deepEqual(scopedStoryReplies(next.request.replies, 'first-update', [], false).map(row => row.id), ['unrelated-reply']);
  assert.deepEqual(scopedStoryReplies(next.request.replies, undefined, [], false).map(row => row.id), ['original-reply']);
  assert.equal(getStoryPosts(next.request).length, 2);
  assert.equal(next.notice?.recipientId, elena.id);
  assert.equal(removeGroupContent(next.request, group(), maria.id, input, now + 1).notice, null);
  assert.equal(editOwnStoryText(next.request, 'elena', { postId: 'first-update', replyId: 'update-reply' }, { text: 'Edited', expectedRevision: 2 }, new Date(now).toISOString()).state, 'denied');
});

test('reply removals reject wrong story scope, automatic receipts, deleted content and own words', () => {
  const original = request(); const base = { reason: 'other' as const, expectedRevision: 1 };
  assert.throws(() => removeGroupContent(original, group(), maria.id, { ...base, replyId: 'update-reply' }, now));
  assert.throws(() => removeGroupContent(original, group(), maria.id, { ...base, postId: 'unknown', replyId: 'update-reply' }, now));
  for (const override of [{ automatic: true }, { deletedAt: new Date(now).toISOString() }, { actorId: maria.id }]) {
    const value = request(); Object.assign(value.replies[0], override);
    assert.throws(() => removeGroupContent(value, group(), maria.id, { ...base, replyId: 'original-reply' }, now));
  }
});

test('same reply identifier in another post never widens the chosen removal scope', () => {
  const original = request(); original.replies.push({ id: 'update-reply', testimonyId: 'later-testimony', actorId: 'member', name: 'Samuel', text: 'Other copy' });
  try {
    const result = removeGroupContent(original, group(), maria.id, { postId: 'first-update', replyId: 'update-reply', reason: 'other', expectedRevision: 2 }, now);
    assert.equal(result.request.replies.find(row => row.id === 'update-reply' && row.testimonyId === 'later-testimony')!.groupRemoval, undefined);
  } catch (error) {
    assert.match(String(error), /no longer available|ambiguous|duplicate/i);
  }
});

test('a sole admin can close a group while moderators cannot request or approve deletion', () => {
  const start = group(); const next = apply(start, owner, { type: 'request_deletion' });
  assert.equal(next.archivedAt, now); assert.equal(next.deletionProposal, undefined);
  assert.ok(next.members.every(row => row.status === 'left' && row.role === 'member' && !row.officialReply));
  assert.throws(() => apply(start, maria, { type: 'request_deletion' }));
  assert.throws(() => apply(start, maria, { type: 'approve_deletion', proposalId: 'anything' }));
  assert.throws(() => apply(next, owner, { type: 'request_deletion' }));
});

test('multi-admin deletion needs every current admin and preserves earlier state until unanimous', () => {
  let start = apply(group(), owner, { type: 'set_role', targetId: samuel.id, role: 'admin' });
  start.members.push(member(elena, { role: 'admin' }));
  const before = structuredClone(start);
  const proposal = apply(start, owner, { type: 'request_deletion' });
  assert.equal(proposal.archivedAt, null); assert.deepEqual(proposal.deletionProposal?.adminIds, ['elena', 'member', 'owner']);
  const accepted = apply(proposal, samuel, { type: 'approve_deletion', proposalId: proposal.deletionProposal!.id });
  assert.equal(accepted.archivedAt, null);
  assert.deepEqual(proposal.deletionProposal!.approvedBy, [owner.id]);
  const closed = apply(accepted, elena, { type: 'approve_deletion', proposalId: proposal.deletionProposal!.id });
  assert.equal(closed.archivedAt, now); assert.deepEqual(start, before);
  const notices = groupNoticesForCommand(accepted, closed, elena.id, { type: 'approve_deletion', proposalId: proposal.deletionProposal!.id });
  assert.equal(notices.length, start.members.length); assert.ok(notices.every(row => row.kind === 'group_deleted'));
});

test('any admin may cancel deletion; stale proposal IDs, duplicate votes and version races fail', () => {
  const start = apply(group(), owner, { type: 'set_role', targetId: samuel.id, role: 'admin' });
  const proposal = apply(start, owner, { type: 'request_deletion' }); const id = proposal.deletionProposal!.id;
  assert.throws(() => apply(proposal, owner, { type: 'approve_deletion', proposalId: id }));
  assert.throws(() => apply(proposal, samuel, { type: 'approve_deletion', proposalId: 'old-proposal' }));
  assert.throws(() => applyGroupCommand(proposal, samuel, { type: 'approve_deletion', proposalId: id }, start.version, groupPeople, now));
  const cancelled = apply(proposal, samuel, { type: 'cancel_deletion', proposalId: id });
  assert.equal(cancelled.archivedAt, null); assert.equal(cancelled.deletionProposal, undefined);
  assert.throws(() => apply(cancelled, owner, { type: 'approve_deletion', proposalId: id }));
  const fresh = apply(cancelled, owner, { type: 'request_deletion' });
  assert.notEqual(fresh.deletionProposal!.id, id); assert.deepEqual(fresh.deletionProposal!.approvedBy, [owner.id]);
});

test('admin promotion, demotion or departure invalidates previous deletion consent', () => {
  const start = apply(group(), owner, { type: 'set_role', targetId: samuel.id, role: 'admin' });
  for (const command of [
    { type: 'set_role', targetId: maria.id, role: 'admin' },
    { type: 'set_role', targetId: samuel.id, role: 'member' },
    { type: 'leave' },
  ] satisfies GroupCommand[]) {
    const proposal = apply(start, owner, { type: 'request_deletion' }); const id = proposal.deletionProposal!.id;
    const changed = apply(proposal, owner, command);
    assert.equal(changed.archivedAt, null); assert.equal(changed.deletionProposal, undefined);
    const remainingAdmin = changed.members.find(row => row.role === 'admin' && row.active && row.status === 'approved')!;
    assert.throws(() => apply(changed, remainingAdmin, { type: 'approve_deletion', proposalId: id }));
  }
});

test('inactive admins remain in deletion quorum and cannot be silently skipped', () => {
  const start = apply(group(), owner, { type: 'set_role', targetId: samuel.id, role: 'admin' });
  start.members.find(row => row.id === samuel.id)!.active = false;
  const proposal = apply(start, owner, { type: 'request_deletion' });
  assert.equal(proposal.archivedAt, null); assert.deepEqual(proposal.deletionProposal!.adminIds, ['member', 'owner']);
  assert.throws(() => apply(proposal, samuel, { type: 'approve_deletion', proposalId: proposal.deletionProposal!.id }));
  assert.throws(() => apply(proposal, owner, { type: 'set_role', targetId: samuel.id, role: 'member' }));
  const notices = groupNoticesForCommand(start, proposal, owner.id, { type: 'request_deletion' });
  assert.deepEqual(notices.map(row => row.recipientId).sort(), ['member', 'owner']);
  assert.deepEqual(visibleGroupNotices(notices, maria.id), []);
});

test('last active admin cannot bypass another inactive admin by leaving and closing the group', () => {
  const start = apply(group(), owner, { type: 'set_role', targetId: samuel.id, role: 'admin' });
  start.members = start.members.filter(row => row.id !== maria.id);
  start.members.find(row => row.id === samuel.id)!.active = false;
  assert.throws(() => planGroupDeparture(start, owner.id, undefined, now));
  assert.throws(() => apply(start, owner, { type: 'leave' }));
  assert.equal(start.archivedAt, null);
  assert.equal(start.members.find(row => row.id === owner.id)?.status, 'approved');
});
