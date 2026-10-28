import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGroupCommand, createPrayerGroup, groupPeople, initialPrayerGroups, isGroupAdmin, normalizeGroupUsername, planGroupDeparture } from './prayer-groups.ts';
import type { GroupCommand, PrayerGroup } from './prayer-groups.ts';
import { isOwnPrayerBox } from './domain.ts';
import { findPrayerRecipients } from './recipients.ts';

const elena = groupPeople[0]; const daniel = groupPeople[4]; const jordan = groupPeople[5];
const initial = () => initialPrayerGroups()[1];
const change = (group: PrayerGroup, actor = elena, command: GroupCommand) => applyGroupCommand(group, actor, command, group.version, groupPeople, group.updatedAt + 10_000);
test('creating a group requires an active individual and a unique case-insensitive username', () => {
  const state = initialPrayerGroups();
  const values = { name: '  Evening prayer  ', username: '@EVENING-PRAYER', website: '', icon: 'heart' as const };
  const group = createPrayerGroup(state, elena, values, 100, 'example');
  assert.equal(group.name, 'Evening prayer'); assert.equal(group.username, 'evening-prayer'); assert.equal(isGroupAdmin(group, elena.id), true);
  assert.throws(() => createPrayerGroup([...state, group], daniel, values));
  assert.throws(() => createPrayerGroup(state, { ...elena, active: false }, values));
  for (const username of ['ab','@a--','hello world','<script>','1hello','a'.repeat(33)]) assert.throws(() => normalizeGroupUsername(username));
});
test('invitation grants no approval until accepted; stale, declined, and cancelled invitations cannot admit', () => {
  const group = initial(); assert.equal(group.members.find(member => member.id === jordan.id)?.status, 'invited');
  const accepted = change(group, jordan, { type: 'accept_invite' });
  assert.equal(accepted.members.find(member => member.id === jordan.id)?.status, 'approved');
  const declined = change(group, jordan, { type: 'decline_invite' });
  assert.throws(() => change(declined, jordan, { type: 'accept_invite' }));
  const cancelled = change(group, elena, { type: 'cancel_invite', targetId: jordan.id });
  assert.throws(() => change(cancelled, jordan, { type: 'accept_invite' }));
  const departed = change(group, elena, { type: 'leave' });
  assert.throws(() => change(departed, jordan, { type: 'accept_invite' }));
});
test('join request requires admin approval and can be withdrawn or denied before reapplying', () => {
  const person = groupPeople[2]; let group = change(initial(), person, { type: 'request_join' });
  assert.equal(group.members.find(member => member.id === person.id)?.status, 'pending');
  assert.throws(() => change(group, daniel, { type: 'approve', targetId: person.id }));
  group = change(group, person, { type: 'withdraw' });
  group = change(group, person, { type: 'request_join' });
  group = change(group, elena, { type: 'deny', targetId: person.id });
  group = change(group, person, { type: 'request_join' });
  group = change(group, elena, { type: 'approve', targetId: person.id });
  assert.equal(group.members.find(member => member.id === person.id)?.status, 'approved');
});
test('membership and admin permissions are distinct and final admin cannot be demoted', () => {
  const group = initial();
  assert.throws(() => change(group, daniel, { type: 'edit', name: 'Wrong', website: '', icon: 'box' }));
  assert.throws(() => change(group, elena, { type: 'demote', targetId: elena.id }));
  const promoted = change(group, elena, { type: 'promote', targetId: daniel.id });
  assert.equal(isGroupAdmin(promoted, daniel.id), true);
  const demoted = change(promoted, elena, { type: 'demote', targetId: elena.id });
  assert.equal(isGroupAdmin(demoted, elena.id), false);
  assert.equal(demoted.members.find(member => member.id === elena.id)?.status, 'approved');
});
test('last-admin departure appoints longest continuous active membership, with stable ID tie break', () => {
  const group = initial();
  group.members.push({ ...groupPeople[2], status: 'approved', role: 'member', joinedAt: group.createdAt - 1000, updatedAt: group.createdAt });
  assert.equal(planGroupDeparture(group, elena.id).successor?.id, 'maria');
  const next = change(group, elena, { type: 'leave' }); assert.equal(isGroupAdmin(next, 'maria'), true);
  assert.equal(next.members.find(member => member.id === elena.id)?.status, 'left');
  const tied = initial(); tied.members.push({ ...groupPeople[2], status: 'approved', role: 'member', joinedAt: tied.members[1].joinedAt, updatedAt: tied.createdAt });
  assert.equal(planGroupDeparture(tied, elena.id).successor?.id, 'daniel');
});
test('explicit successor overrides tenure but cannot be pending, invited, blocked, inactive, or self', () => {
  const group = initial(); group.members.push({ ...groupPeople[2], status: 'approved', role: 'member', joinedAt: group.createdAt - 1000, updatedAt: group.createdAt });
  assert.equal(planGroupDeparture(group, elena.id, daniel.id).successor?.id, daniel.id);
  for (const id of [elena.id,jordan.id,'not-a-member']) assert.throws(() => planGroupDeparture(group, elena.id, id));
  group.members.find(member => member.id === daniel.id)!.active = false;
  assert.throws(() => planGroupDeparture(group, elena.id, daniel.id));
  group.members.find(member => member.id === 'maria')!.status = 'blocked';
  assert.equal(planGroupDeparture(group, elena.id).archive, true);
});
test('empty last-admin departure archives instead of appointing an outsider', () => {
  const group = initial(); group.members = group.members.filter(member => member.id !== daniel.id);
  const next = change(group, elena, { type: 'leave' }); assert.ok(next.archivedAt);
  assert.throws(() => change(next, jordan, { type: 'accept_invite' }));
});
test('blocking revokes membership; unblocking does not restore it or bypass approval', () => {
  let group = change(initial(), elena, { type: 'block', targetId: daniel.id });
  assert.equal(group.members.find(member => member.id === daniel.id)?.status, 'blocked');
  assert.throws(() => change(group, daniel, { type: 'request_join' }));
  group = change(group, elena, { type: 'unblock', targetId: daniel.id });
  assert.equal(group.members.find(member => member.id === daniel.id)?.status, 'left');
  group = change(group, daniel, { type: 'request_join' }); assert.equal(group.members.find(member => member.id === daniel.id)?.status, 'pending');
});
test('stale operations fail instead of overwriting another membership change', () => {
  const group = initial(); const updated = change(group, elena, { type: 'promote', targetId: daniel.id });
  assert.throws(() => applyGroupCommand(updated, elena, { type: 'leave' }, group.version, groupPeople));
  assert.equal(group.members.find(member => member.id === daniel.id)?.role, 'member');
});
test('leaving and rejoining starts fresh continuous membership tenure', () => {
  let group = change(initial(), daniel, { type: 'leave' });
  group = change(group, daniel, { type: 'request_join' });
  const before = group.updatedAt;
  group = change(group, elena, { type: 'approve', targetId: daniel.id });
  assert.ok(group.members.find(member => member.id === daniel.id)!.joinedAt! > before);
});

test('ownership follows succession, so self-submission guards and directory use the new owner', () => {
  const original = initialPrayerGroups()[0]; const owner = groupPeople[1]; const maria = groupPeople[2];
  const next = change(original, owner, { type: 'leave', successorId: maria.id });
  assert.equal(next.ownerId, maria.id);
  assert.equal(isOwnPrayerBox(owner.id, 'grace', next.ownerId), false);
  assert.equal(isOwnPrayerBox(maria.id, 'grace', next.ownerId), true);
  assert.equal(findPrayerRecipients('@gracechurch', 'owner', [], { organizationOwnerId: next.ownerId }).some(row => row.id === 'grace'), true);
  assert.equal(findPrayerRecipients('@gracechurch', 'maria', [], { organizationOwnerId: next.ownerId }).some(row => row.id === 'grace'), false);
  const withCoadmin = change(original, owner, { type: 'promote', targetId: maria.id });
  assert.equal(withCoadmin.ownerId, owner.id);
  assert.equal(change(withCoadmin, owner, { type: 'demote', targetId: owner.id }).ownerId, maria.id);
});

test('official group replies need separate permission and it is not inherited or restored after leaving', () => {
  let group = initialPrayerGroups()[0]; const owner = groupPeople[1]; const maria = groupPeople[2];
  assert.equal(group.members.find(member => member.id === owner.id)?.officialReply, true);
  assert.throws(() => change(group, maria, { type: 'set_official_reply', targetId: maria.id, allowed: true }));
  group = change(group, owner, { type: 'promote', targetId: maria.id });
  assert.equal(Boolean(group.members.find(member => member.id === maria.id)?.officialReply), false);
  group = change(group, owner, { type: 'set_official_reply', targetId: maria.id, allowed: true });
  assert.equal(group.members.find(member => member.id === maria.id)?.officialReply, true);
  group = change(group, owner, { type: 'leave' });
  assert.equal(group.ownerId, maria.id);
  assert.equal(group.members.find(member => member.id === owner.id)?.officialReply, false);
  group = change(group, owner, { type: 'request_join' });
  group = change(group, maria, { type: 'approve', targetId: owner.id });
  assert.equal(group.members.find(member => member.id === owner.id)?.officialReply, false);
  const automatic = change(initialPrayerGroups()[0], owner, { type: 'leave' });
  assert.equal(Boolean(automatic.members.find(member => member.id === automatic.ownerId)?.officialReply), false);
});
