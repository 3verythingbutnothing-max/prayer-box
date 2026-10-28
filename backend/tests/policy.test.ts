import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManageMembership, canReadDelivery, canReadPost, canReplyToPost, canSubmitToBox } from '../src/policy.ts';
import type { Actor, DeliveryContext, PostRow, ReplyRow } from '../src/policy.ts';
import { toDeliveryDto, toPostDto, toReplyDto } from '../src/dto.ts';

const actor = (id = 'viewer', overrides: Partial<Actor> = {}): Actor => ({
  id, username: 'fixture', displayName: 'Fictional User', status: 'active', visibility: 'private',
  sessionId: 'session', sessionEpoch: 0, csrfHash: 'hash', assurance: 'basic',
  authenticatedAt: 100, expiresAt: 10000, ...overrides,
});
const delivery = (overrides: Partial<DeliveryContext> = {}): DeliveryContext => ({
  id: 'delivery', source_id: 'secret-source', box_id: 'box', audience: 'private',
  author_ceiling: 'private', box_ceiling: 'private', anonymous: 1, status: 'approved',
  history_policy: 'personal', history_notice_version: null, group_block_policy: null,
  created_at: 100, deleted_at: null, version: 1, author_id: 'author',
  author_username: 'secret-handle', author_display_name: 'Secret Name', author_visibility: 'private',
  author_status: 'active', source_deleted_at: null, box_kind: 'personal', box_owner_id: 'recipient',
  box_name: 'Box', box_visibility: 'private', box_status: 'active', box_owner_status: 'active',
  membership_status: null, membership_approved_at: null, membership_revoked_at: null,
  membership_official_reply: null, author_friend: 0, box_friend: 0, blocked_with_author: 0,
  blocked_with_owner: 0, blocked_by_box: 0, group_block_conflict: 0, personal_block_conflict: 0, ...overrides,
});
const organization = (overrides: Partial<DeliveryContext> = {}): DeliveryContext => delivery({
  box_kind: 'organization', history_policy: 'retained', history_notice_version: 'fixture-v1',
  group_block_policy: 'hold_on_conflict', membership_status: 'approved',
  membership_approved_at: 50, ...overrides,
});
const post: PostRow = {
  id: 'post', delivery_id: 'delivery', kind: 'update', title: 'Fictional title',
  body: 'Synthetic text', revision: 1, status: 'approved', created_at: 150, deleted_at: null,
};
const reply: ReplyRow = {
  id: 'reply', delivery_id: 'delivery', post_id: 'post', parent_id: null, actor_id: 'author',
  identity_mode: 'personal', body: 'Synthetic reply', revision: 1, status: 'approved',
  created_at: 160, deleted_at: null, actor_username: 'secret-handle', actor_display_name: 'Secret Name',
  actor_status: 'active', blocked_with_viewer: 0, official_reply_current: 0,
};

test('private personal deliveries belong to author and recipient, never affiliated members or outsiders', () => {
  assert.equal(canReadDelivery(delivery(), actor('author')), true);
  assert.equal(canReadDelivery(delivery(), actor('recipient')), true);
  assert.equal(canReadDelivery(delivery({ membership_status: 'approved' }), actor('member')), false);
  assert.equal(canReadDelivery(delivery(), actor()), false);
  assert.equal(canReadDelivery(delivery(), null), false);
});

test('public outsider access intersects all five audience/ceiling restrictions', () => {
  const open = delivery({ audience: 'everyone', author_ceiling: 'everyone', author_visibility: 'everyone',
    box_ceiling: 'everyone', box_visibility: 'everyone' });
  assert.equal(canReadDelivery(open, null), true);
  for (const key of ['audience', 'author_ceiling', 'author_visibility', 'box_ceiling', 'box_visibility'] as const) {
    assert.equal(canReadDelivery({ ...open, [key]: 'private' }, actor()), false, key);
  }
});

test('friend circles intersect; a member circle is not the union of church friendships', () => {
  const friends = delivery({ audience: 'friends', author_ceiling: 'friends', author_visibility: 'friends',
    box_ceiling: 'friends', box_visibility: 'friends', author_friend: 1, box_friend: 0 });
  assert.equal(canReadDelivery(friends, actor()), false);
  assert.equal(canReadDelivery({ ...friends, author_friend: 0, box_friend: 1 }, actor()), false);
  assert.equal(canReadDelivery({ ...friends, box_friend: 1 }, actor()), true);
});

test('all currently approved organization members covered by explicit history can read', () => {
  assert.equal(canReadDelivery(organization(), actor('member')), true);
  assert.equal(canReadDelivery(organization({ membership_approved_at: 200 }), actor('later-member')), true);
  assert.equal(canReadDelivery(organization({ history_policy: 'at_delivery', membership_approved_at: 200 }), actor()), false);
  assert.equal(canReadDelivery(organization({ history_policy: 'at_delivery', membership_approved_at: 100 }), actor()), true);
  assert.equal(canReadDelivery(organization({ history_notice_version: null }), actor()), false);
  assert.equal(canReadDelivery(organization({ group_block_policy: null }), actor()), false);
});

test('pending, invited, revoked and absent members receive no organization-derived access', () => {
  for (const membership_status of ['pending', 'invited', 'revoked', 'declined', null]) {
    assert.equal(canReadDelivery(organization({ membership_status }), actor()), false);
  }
  assert.equal(canReadDelivery(organization({ membership_revoked_at: 120 }), actor()), false);
  assert.equal(canReadDelivery(organization({ membership_approved_at: null }), actor()), false);
});

test('whole-group provisional block hold is uniform; it does not secretly exclude one approved member', () => {
  const held = organization({ group_block_conflict: 1 });
  assert.equal(canReadDelivery(held, actor('member-a')), false);
  assert.equal(canReadDelivery(held, actor('member-b')), false);
  assert.equal(canReadDelivery(held, actor('recipient')), false);
  assert.equal(canReadDelivery(held, actor('author')), true);
});

test('pending, deleted, restricted, blocked and suspended records fail closed', () => {
  for (const changed of [
    { status: 'pending' }, { status: 'rejected' }, { deleted_at: 100 }, { source_deleted_at: 100 },
    { author_status: 'suspended' }, { author_status: 'restricted' }, { box_status: 'suspended' },
    { box_owner_status: 'deleted' }, { blocked_with_author: 1 }, { blocked_with_owner: 1 }, { blocked_by_box: 1 },
    { personal_block_conflict: 1 },
  ]) assert.equal(canReadDelivery(delivery(changed), actor('recipient')), false, JSON.stringify(changed));
});

test('anonymous DTO cannot disclose source/author identity, sibling recipients or private receipt', () => {
  const result = toDeliveryDto(delivery(), actor('recipient'));
  assert.deepEqual(result?.author, { label: 'Anonymous' });
  const serialized = JSON.stringify(result);
  for (const secret of ['secret-source', 'secret-handle', 'Secret Name', 'source_id', 'author_id', 'acknowledgment', 'agreedBy']) {
    assert.equal(serialized.includes(secret), false, secret);
  }
  assert.equal(toDeliveryDto(delivery(), actor()), null);
});

test('exact-post replies and inherited anonymity are preserved', () => {
  const context = delivery();
  assert.equal(canReadPost(context, { ...post, delivery_id: 'other' }, actor('recipient')), false);
  assert.equal(toPostDto(context, { ...post, status: 'pending' }, actor('recipient')), null);
  assert.deepEqual(toReplyDto(context, post, reply, actor('recipient'))?.byline, { label: 'Anonymous' });
  assert.equal(toReplyDto(context, post, { ...reply, post_id: 'other' }, actor('recipient')), null);
  assert.equal(toReplyDto(context, post, { ...reply, blocked_with_viewer: 1 }, actor('recipient')), null);
});

test('organization byline requires current official permission and cannot identify an anonymous author', () => {
  const context = organization({ membership_official_reply: 0 });
  assert.equal(canReplyToPost(context, post, actor(), 'personal'), true);
  assert.equal(canReplyToPost(context, post, actor(), 'organization'), false);
  assert.equal(canReplyToPost({ ...context, membership_official_reply: 1 }, post, actor(), 'organization'), true);
  assert.equal(canReplyToPost({ ...context, membership_official_reply: 1 }, post, actor('author'), 'organization'), false);
});

test('a person cannot submit to any box they own, and org submission requires approved history policy', () => {
  const context = { kind: 'personal' as const, ownerId: 'viewer', status: 'active', blocked: false, historyPolicyApproved: false };
  assert.equal(canSubmitToBox(context, actor()), false);
  assert.equal(canSubmitToBox({ ...context, ownerId: 'recipient' }, actor()), true);
  assert.equal(canSubmitToBox({ ...context, kind: 'organization' }, actor()), false);
  assert.equal(canSubmitToBox({ ...context, kind: 'organization', historyPolicyApproved: true }, actor()), false);
  assert.equal(canSubmitToBox({ ...context, kind: 'organization', ownerId: 'another-owner', historyPolicyApproved: true }, actor()), true);
});

test('membership administration requires verified owner, active approval and recent MFA', () => {
  const context = { kind: 'organization', status: 'active', ownerId: 'viewer', authorityVerifiedAt: 1, ownerMembershipApproved: true };
  assert.equal(canManageMembership(context, actor(), 200), false);
  assert.equal(canManageMembership(context, actor('viewer', { assurance: 'mfa' }), 200), true);
  assert.equal(canManageMembership(context, actor('viewer', { assurance: 'mfa' }), 400000), false);
  assert.equal(canManageMembership({ ...context, authorityVerifiedAt: null }, actor('viewer', { assurance: 'mfa' }), 200), false);
});
