export const groupIcons = ['heart', 'people', 'box', 'sun', 'note', 'shield'] as const;
export type GroupIcon = typeof groupIcons[number];
export type GroupPerson = { id: string; name: string; username: string; active: boolean };
export type GroupMember = GroupPerson & {
  status: 'approved' | 'pending' | 'invited' | 'declined' | 'left' | 'blocked';
  role: 'admin' | 'moderator' | 'member'; moderatorSince?: number | null; joinedAt: number | null; updatedAt: number; invitedBy?: string; officialReply?: boolean;
};
export type PrayerGroup = {
  id: string; ownerId: string; name: string; username: string; website: string; icon: GroupIcon;
  image?: string; version: number; createdAt: number; updatedAt: number;
  archivedAt: number | null; members: GroupMember[];
  deletionProposal?: { id: string; requestedBy: string; createdAt: number; adminIds: string[]; approvedBy: string[] };
};
export type GroupState = PrayerGroup[];
export type GroupCommand =
  | { type: 'request_deletion' }
  | { type: 'approve_deletion' | 'cancel_deletion'; proposalId: string }
  | { type: 'edit'; name: string; website: string; icon: GroupIcon; image?: string }
  | { type: 'request_join' | 'withdraw' | 'accept_invite' | 'decline_invite' }
  | { type: 'invite' | 'cancel_invite' | 'approve' | 'deny' | 'remove' | 'block' | 'unblock' | 'promote' | 'demote'; targetId: string }
  | { type: 'set_role'; targetId: string; role: GroupMember['role'] }
  | { type: 'set_official_reply'; targetId: string; allowed: boolean }
  | { type: 'leave'; successorId?: string };

export const groupPeople: GroupPerson[] = [
  { id: 'elena', name: 'Elena', username: 'elena', active: true },
  { id: 'owner', name: 'Grace Church admin', username: 'grace-admin', active: true },
  { id: 'maria', name: 'Maria', username: 'maria', active: true },
  { id: 'member', name: 'Samuel', username: 'samuel', active: true },
  { id: 'daniel', name: 'Daniel', username: 'daniel', active: true },
  { id: 'jordan', name: 'Jordan', username: 'jordan', active: true },
];

export class GroupError extends Error {}
export function normalizeGroupUsername(value: string): string {
  const result = value.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9-]{2,31}$/.test(result) || result.endsWith('-'))
    throw new GroupError('Choose a unique username of 3–32 letters, numbers, or hyphens, starting with a letter.');
  return result;
}
export function isGroupAdmin(group: PrayerGroup, actorId: string): boolean {
  return !group.archivedAt && group.members.some(member => member.id === actorId && member.active && member.status === 'approved' && member.role === 'admin');
}
export function isGroupModerator(group: PrayerGroup, actorId: string): boolean {
  return !group.archivedAt && group.members.some(member => member.id === actorId && member.active && member.status === 'approved' && member.role === 'moderator');
}
export function canModerateGroup(group: PrayerGroup, actorId: string): boolean {
  return isGroupAdmin(group, actorId) || isGroupModerator(group, actorId);
}
export function planGroupDeparture(group: PrayerGroup, actorId: string, successorId?: string, now = Date.now()) {
  const actor = group.members.find(member => member.id === actorId);
  if (!actor || actor.status !== 'approved' || !actor.active) throw new GroupError('You are not an active member of this group.');
  const eligible = group.members.filter(member => member.id !== actorId && member.active && member.status === 'approved' && member.joinedAt !== null && Number.isFinite(member.joinedAt) && member.joinedAt <= now
      && (member.role !== 'moderator' || member.moderatorSince == null || Number.isFinite(member.moderatorSince) && member.moderatorSince <= now))
    .sort((a, b) => Number(b.role === 'moderator') - Number(a.role === 'moderator')
      || (a.role === 'moderator' && b.role === 'moderator' ? (a.moderatorSince ?? a.joinedAt ?? Infinity) - (b.moderatorSince ?? b.joinedAt ?? Infinity) : 0)
      || (a.joinedAt ?? Infinity) - (b.joinedAt ?? Infinity) || a.id.localeCompare(b.id));
  const anotherAdmin = eligible.find(member => member.role === 'admin');
  if (actor.role !== 'admin' || anotherAdmin) return { successor: null, archive: false, eligible };
  const successor = successorId ? eligible.find(member => member.id === successorId) : eligible[0];
  if (successorId && !successor) throw new GroupError('Choose a currently active, approved member as the next admin.');
  if (!successor && group.members.some(member => member.id !== actorId && member.status === 'approved' && member.role === 'admin'))
    throw new GroupError('Another admin is inactive. Arrange an active successor before leaving; closing the group still needs every admin’s agreement.');
  return { successor: successor ?? null, archive: !successor, eligible };
}
export function createPrayerGroup(state: GroupState, actor: GroupPerson, values: { name: string; username: string; website: string; icon: GroupIcon; image?: string }, now = Date.now(), id = crypto.randomUUID()): PrayerGroup {
  if (!actor.active) throw new GroupError('Sign in with an active account to create a prayer group.');
  const username = normalizeGroupUsername(values.username);
  if (state.some(group => group.username === username)) throw new GroupError('That username is already in use. Please choose another.');
  const name = values.name.trim();
  if (!name || name.length > 80 || !groupIcons.includes(values.icon)) throw new GroupError('Give your group a name of up to 80 characters and choose an icon.');
  return { id, ...values, ownerId: actor.id, name, username, version: 1, createdAt: now, updatedAt: now, archivedAt: null,
    members: [{ ...actor, status: 'approved', role: 'admin', joinedAt: now, updatedAt: now }] };
}

/** A deterministic lifecycle shared by the local UI and the guarded Worker mutations. */
export function applyGroupCommand(original: PrayerGroup, actor: GroupPerson, command: GroupCommand, expectedVersion: number, people: readonly GroupPerson[], now = Date.now()): PrayerGroup {
  if (!actor.active || original.archivedAt) throw new GroupError('This group is not available for changes.');
  if (original.version !== expectedVersion) throw new GroupError('This group changed. Refresh it before trying again.');
  const group: PrayerGroup = { ...original, members: original.members.map(member => ({ ...member })) };
  const self = group.members.find(member => member.id === actor.id);
  const admin = isGroupAdmin(group, actor.id);
  const moderator = isGroupModerator(group, actor.id);
  if (self?.status === 'blocked') throw new GroupError('This group is not available for changes.');
  const target = 'targetId' in command ? group.members.find(member => member.id === command.targetId) : undefined;
  const adminActions = ['request_deletion', 'approve_deletion', 'cancel_deletion', 'edit', 'invite', 'cancel_invite', 'block', 'unblock', 'promote', 'demote', 'set_role', 'set_official_reply'];
  if (['approve', 'deny', 'remove'].includes(command.type) && !admin && !moderator) throw new GroupError('Only an active group admin or moderator can make this change.');
  if (adminActions.includes(command.type) && !admin) throw new GroupError('Only an active group admin can make this change.');
  const upsertSelf = (status: GroupMember['status']) => {
    if (self) Object.assign(self, { status, role: 'member', moderatorSince: null, joinedAt: status === 'approved' ? now : null, updatedAt: now, officialReply: false });
    else group.members.push({ ...actor, status, role: 'member', moderatorSince: null, joinedAt: null, updatedAt: now });
  };
  const adminIds = (value: PrayerGroup) => value.members.filter(member => member.status === 'approved' && member.role === 'admin').map(member => member.id).sort();
  const originalAdmins = adminIds(original);
  const proposalCurrent = group.deletionProposal && JSON.stringify(group.deletionProposal.adminIds) === JSON.stringify(originalAdmins);
  if (group.deletionProposal && !proposalCurrent) group.deletionProposal = undefined;
  const closeGroup = () => {
    group.archivedAt = now; group.deletionProposal = undefined;
    group.members.forEach(member => { if (['approved', 'pending', 'invited'].includes(member.status)) Object.assign(member, { status: 'left', role: 'member', moderatorSince: null, joinedAt: null, officialReply: false, updatedAt: now }); });
  };
  switch (command.type) {
    case 'request_deletion':
      if (group.deletionProposal) throw new GroupError('A deletion proposal already exists. Review it or cancel it first.');
      group.deletionProposal = { id: `${group.id}/deletion/${group.version + 1}`, requestedBy: actor.id, createdAt: now, adminIds: originalAdmins, approvedBy: [actor.id] };
      if (originalAdmins.length === 1) closeGroup();
      break;
    case 'approve_deletion':
    case 'cancel_deletion': {
      const proposal = group.deletionProposal;
      if (!proposal || proposal.id !== command.proposalId) throw new GroupError('This deletion proposal changed. Ask an admin to start a fresh proposal.');
      if (command.type === 'cancel_deletion') { group.deletionProposal = undefined; break; }
      if (proposal.approvedBy.includes(actor.id)) throw new GroupError('You have already approved this proposal.');
      group.deletionProposal = { ...proposal, approvedBy: [...proposal.approvedBy, actor.id] };
      if (originalAdmins.every(id => group.deletionProposal!.approvedBy.includes(id)) && originalAdmins.every(id => group.members.some(member => member.id === id && member.active))) closeGroup();
      break;
    }
    case 'edit': {
      const name = command.name.trim();
      if (!name || name.length > 80 || !groupIcons.includes(command.icon)) throw new GroupError('Use a name of up to 80 characters and choose an icon.');
      Object.assign(group, { name, website: command.website, icon: command.icon, image: command.image }); break;
    }
    case 'request_join':
      if (self && ['approved', 'pending', 'invited'].includes(self.status)) throw new GroupError('You already have a membership, request, or invitation here.');
      upsertSelf('pending'); break;
    case 'withdraw':
      if (self?.status !== 'pending') throw new GroupError('There is no pending request to withdraw.');
      upsertSelf('left'); break;
    case 'accept_invite':
      if (self?.status !== 'invited') throw new GroupError('This invitation is no longer available.');
      // An invitation ceases to authorize admission when its sender loses admin access.
      if (!self.invitedBy || !isGroupAdmin(group, self.invitedBy)) throw new GroupError('Ask a current admin to send you a new invitation.');
      upsertSelf('approved'); break;
    case 'decline_invite':
      if (self?.status !== 'invited') throw new GroupError('This invitation is no longer available.');
      upsertSelf('declined'); break;
    case 'invite': {
      const person = people.find(person => person.id === command.targetId && person.active);
      if (!person || person.id === actor.id || target && ['approved', 'blocked', 'invited'].includes(target.status)) throw new GroupError('Choose an available person who is not already a member or invited.');
      if (target?.status === 'pending') throw new GroupError('Approve or deny this person’s existing join request.');
      const invitation: GroupMember = { ...person, status: 'invited', role: 'member', joinedAt: null, updatedAt: now, invitedBy: actor.id, officialReply: false };
      if (target) Object.assign(target, invitation); else group.members.push(invitation); break;
    }
    case 'cancel_invite':
      if (target?.status !== 'invited') throw new GroupError('That invitation is no longer pending.');
      Object.assign(target, { status: 'left', updatedAt: now }); break;
    case 'approve':
    case 'deny':
      if (target?.status !== 'pending' || !target.active) throw new GroupError('That join request is no longer available.');
      Object.assign(target, { status: command.type === 'approve' ? 'approved' : 'declined', joinedAt: command.type === 'approve' ? now : null, updatedAt: now, officialReply: false }); break;
    case 'set_role':
    case 'promote':
    case 'demote': {
      if (!target || target.status !== 'approved' || !target.active) throw new GroupError('Choose an active, approved member.');
      const nextRole = command.type === 'set_role' ? command.role : command.type === 'promote' ? 'admin' : 'member';
      if (!['admin', 'moderator', 'member'].includes(nextRole)) throw new GroupError('Choose an available group role.');
      if (nextRole === target.role) throw new GroupError('This person already has that role.');
      if (nextRole !== 'admin' && target.role === 'admin' && !group.members.some(member => member.id !== target.id && member.active && member.status === 'approved' && member.role === 'admin')) throw new GroupError('Give another member admin access before removing the last admin role.');
      target.role = nextRole; target.moderatorSince = nextRole === 'moderator' ? now : null; target.updatedAt = now; break;
    }
    case 'set_official_reply':
      if (!target || target.status !== 'approved' || !target.active || typeof command.allowed !== 'boolean') throw new GroupError('Choose an active, approved member.');
      target.officialReply = command.allowed; target.updatedAt = now; break;
    case 'remove':
    case 'block':
      if (!target || target.id === actor.id) throw new GroupError('Use Leave group to end your own membership.');
      if (command.type === 'remove' && target.status !== 'approved') throw new GroupError('That person is no longer an approved member.');
      if (command.type === 'block' && target.status === 'blocked') throw new GroupError('That person is already blocked from this group.');
      if (!admin && (target.status !== 'approved' || target.role !== 'member')) throw new GroupError('Moderators can remove ordinary approved members. Ask an admin to change a staff role.');
      if (target.role === 'admin' && target.status === 'approved') throw new GroupError('Remove admin access before removing or blocking this member.');
      Object.assign(target, { status: command.type === 'block' ? 'blocked' : 'left', role: 'member', moderatorSince: null, joinedAt: null, updatedAt: now, officialReply: false }); break;
    case 'unblock':
      if (target?.status !== 'blocked') throw new GroupError('That person is not blocked from this group.');
      Object.assign(target, { status: 'left', role: 'member', moderatorSince: null, joinedAt: null, updatedAt: now, officialReply: false }); break;
    case 'leave': {
      const plan = planGroupDeparture(group, actor.id, command.successorId, now);
      if (plan.successor) { plan.successor.role = 'admin'; plan.successor.moderatorSince = null; plan.successor.updatedAt = now; }
      if (plan.archive) group.archivedAt = now;
      Object.assign(self!, { status: 'left', role: 'member', moderatorSince: null, joinedAt: null, updatedAt: now, officialReply: false }); break;
    }
  }
  if (JSON.stringify(originalAdmins) !== JSON.stringify(adminIds(group))) group.deletionProposal = undefined;
  if (!group.archivedAt) {
    const admins = group.members.filter(member => member.active && member.status === 'approved' && member.role === 'admin')
      .sort((a, b) => (a.joinedAt ?? Infinity) - (b.joinedAt ?? Infinity) || a.id.localeCompare(b.id));
    group.ownerId = admins.find(member => member.id === original.ownerId)?.id ?? admins[0]?.id ?? original.ownerId;
  }
  group.version += 1; group.updatedAt = now;
  return group;
}

export function initialPrayerGroups(): GroupState {
  const now = Date.UTC(2026, 9, 1, 12);
  return [{ id: 'grace', ownerId: 'owner', name: 'Grace Church', username: 'grace-church', website: '', icon: 'heart', version: 1, createdAt: now, updatedAt: now, archivedAt: null,
    members: groupPeople.filter(person => ['owner', 'maria', 'member'].includes(person.id)).map((person, index) => ({ ...person, role: person.id === 'owner' ? 'admin' : 'member', status: 'approved', joinedAt: now + index * 1000, updatedAt: now, officialReply: person.id === 'owner' })) },
    { id: 'quiet-mornings', ownerId: 'elena', name: 'Quiet mornings', username: 'quiet-mornings', website: '', icon: 'sun', version: 1, createdAt: now, updatedAt: now, archivedAt: null,
      members: [{ ...groupPeople[0], role: 'admin', status: 'approved', joinedAt: now, updatedAt: now }, { ...groupPeople[4], role: 'member', status: 'approved', joinedAt: now + 1000, updatedAt: now }, { ...groupPeople[5], role: 'member', status: 'invited', joinedAt: null, invitedBy: 'elena', updatedAt: now }] }];
}

/** Private, minimal account notices. Never include prayer text, anonymous IDs or a roster. */
export type GroupNotice = {
  id: string; recipientId: string; groupId: string; groupName: string; kind: string;
  title: string; message: string; createdAt: number; readAt?: number;
};
export function groupNoticesForCommand(before: PrayerGroup, next: PrayerGroup, actorId: string, command: GroupCommand): GroupNotice[] {
  if (next.id !== before.id || next.version !== before.version + 1) return [];
  const notices: GroupNotice[] = [];
  const add = (recipientId: string, kind: string, title: string, message: string) => notices.push({
    id: `${next.id}/${next.version}/${recipientId}/${kind}`, recipientId, groupId: next.id, groupName: next.name,
    kind, title, message, createdAt: next.updatedAt,
  });
  if (!before.archivedAt && next.archivedAt && ['request_deletion', 'approve_deletion'].includes(command.type)) {
    for (const member of before.members) if (['approved', 'pending', 'invited'].includes(member.status)) add(member.id, 'group_deleted', 'This prayer group has been deleted.', 'Its admins agreed to close the group. Its inbox and membership access are no longer available. Your personal box and copies in other prayer boxes are unchanged.');
    return notices;
  }
  if (next.deletionProposal && (!before.deletionProposal || command.type === 'approve_deletion')) {
    for (const id of next.deletionProposal.adminIds) add(id, 'deletion_proposed', 'Group deletion needs every admin’s approval.', 'A deletion proposal is pending. Review it in group settings. Any admin can cancel it; the group stays open until every admin agrees.');
  } else if (before.deletionProposal && !next.deletionProposal) {
    for (const id of before.deletionProposal.adminIds) add(id, 'deletion_cancelled', 'Group deletion was cancelled.', 'The proposal was cancelled or the admin team changed. The group stays open; a new proposal needs fresh approvals.');
  }
  for (const member of next.members) {
    const previous = before.members.find(row => row.id === member.id);
    if (member.status === 'approved' && previous?.status !== 'approved') add(member.id, 'joined', 'Your membership is approved.', 'You can now pray with this group. Personal prayer boxes remain separate.');
    if (member.status === 'invited' && previous?.status !== 'invited') add(member.id, 'invited', 'You’re invited to join.', 'Accept or decline this invitation from your prayer groups. Access begins only after you accept.');
    if (command.type === 'deny' && member.id === command.targetId && member.status === 'declined') add(member.id, 'declined', 'Your join request was declined.', 'This group has not approved your membership. This does not affect your personal Prayer Box.');
    if (command.type === 'cancel_invite' && member.id === command.targetId) add(member.id, 'invitation_cancelled', 'Your group invitation was cancelled.', 'This invitation no longer grants a way to join. You can ask the group for a new invitation.');
    if (command.type === 'remove' && member.id === command.targetId) add(member.id, 'removed', 'You’ve been removed from this group.', 'Your membership access has ended. You may request to join again; approval is required. Your personal prayers in other boxes are unchanged.');
    if (command.type === 'block' && member.id === command.targetId) add(member.id, 'blocked', 'Your group membership has ended.', 'You can no longer participate in this group or request to join while this group restriction remains. Your personal account is unchanged.');
    if (command.type === 'unblock' && member.id === command.targetId) add(member.id, 'unblocked', 'Your group restriction was lifted.', 'You may request to join again. Membership approval has not been restored automatically.');
    if (member.status === 'approved' && previous?.status === 'approved' && member.role !== previous.role) {
      const title = member.role === 'admin' ? 'You’re now a group admin.' : member.role === 'moderator' ? 'You’re now a group moderator.' : 'Your group role has changed.';
      const message = member.role === 'admin' ? 'You can manage the group, its members and their roles. Replies in the group’s name still require separate permission.'
        : member.role === 'moderator' ? 'You can review join requests, remove ordinary members, and remove content from this group’s prayer conversations. Only admins can assign roles.'
          : 'You remain an approved member and can pray with the group. You no longer have staff controls.';
      add(member.id, `role_${member.role}`, title, command.type === 'leave' ? `The previous admin left, and the group’s handoff selected you. ${message}` : message);
    }
    if (command.type === 'set_official_reply' && member.id === command.targetId && member.officialReply !== previous?.officialReply) add(member.id, 'reply_permission', 'Your group reply permission changed.', member.officialReply ? 'You may choose the group’s name when replying. Your account remains recorded privately and screening still applies.' : 'You may continue praying personally, but may no longer reply in the group’s name.');
  }
  if (command.type === 'leave') add(actorId, 'left', 'You’ve left the prayer group.', next.archivedAt ? 'The group was closed because no active approved successor remained. Your personal Prayer Box is unchanged.' : 'Your membership access has ended. Your personal Prayer Box and other group memberships are unchanged.');
  return notices;
}
export function visibleGroupNotices(notices: readonly GroupNotice[], viewer: string): GroupNotice[] {
  if (viewer === 'guest') return [];
  return notices.filter(notice => notice.recipientId === viewer).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}
