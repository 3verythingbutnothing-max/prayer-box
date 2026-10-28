import { canModerateGroup, GroupError, isGroupAdmin } from './prayer-groups.ts';
import type { GroupNotice, PrayerGroup } from './prayer-groups.ts';
import type { PrayerRequest } from './domain.ts';

export const groupRemovalReasons = {
  harassment: 'Harassment or threats',
  hate: 'Hateful or demeaning content',
  solicitation: 'Spam or requests for money',
  privacy: 'Someone’s private information',
  trinitarian: 'Teaching contrary to the Trinitarian foundation',
  other: 'Other community-guideline concern',
} as const;
export type GroupRemovalReason = keyof typeof groupRemovalReasons;
export type GroupRemoval = { removedAt: string; actorRole: 'admin' | 'moderator'; reason: GroupRemovalReason };
export type GroupRemovalInput = { postId?: string; replyId?: string; reason: GroupRemovalReason; expectedRevision: number };

/** Local model only: the Worker independently checks staff rights and exact-copy scope. */
export function removeGroupContent(request: PrayerRequest, group: PrayerGroup, actorId: string, input: GroupRemovalInput, now = Date.now()): { request: PrayerRequest; notice: GroupNotice | null } {
  if (!canModerateGroup(group, actorId) || request.recipient !== group.id || request.moderation !== 'approved') throw new GroupError('An active admin or moderator can remove content only from their own group.');
  if (!Number.isFinite(now) || !Object.hasOwn(groupRemovalReasons, input.reason)) throw new GroupError('Choose a reason for this removal.');
  const scope = input.postId === 'original' ? undefined : input.postId;
  // Retain removed records internally for idempotency; never put their text in notices.
  const posts = new Map((request.posts ?? []).map(post => [post.id, post]));
  if (request.testimony && !posts.has(request.testimony.id)) posts.set(request.testimony.id, { ...request.testimony, createdAt: request.testimony.createdAt ?? '' });
  const post = scope ? posts.get(scope) : undefined;
  if (scope && !post) throw new GroupError('That post is no longer available.');
  const matches = input.replyId ? request.replies.filter(reply => reply.id === input.replyId) : [];
  const reply = matches[0];
  if (input.replyId && (matches.length !== 1 || reply.testimonyId !== scope || reply.automatic || reply.deletedAt)) throw new GroupError('That encouragement is no longer available.');
  const item = reply ?? post ?? request;
  const recipientId = reply ? reply.actorId : request.authorId;
  if (!recipientId || recipientId === actorId) throw new GroupError('Use your own edit or delete controls for your words.');
  if (item.groupRemoval) return { request, notice: null };
  if (request.groupRemoval || post?.groupRemoval || (item.revision ?? 1) !== input.expectedRevision) throw new GroupError('This conversation changed. Reopen it before removing content.');
  const removal: GroupRemoval = { removedAt: new Date(now).toISOString(), actorRole: isGroupAdmin(group, actorId) ? 'admin' : 'moderator', reason: input.reason };
  const change = { groupRemoval: removal, pendingEdit: undefined };
  const next = reply ? { ...request, replies: request.replies.map(row => row.id === reply.id ? { ...row, ...change } : row) }
    : post ? { ...request, posts: [...posts.values()].map(row => row.id === post.id ? { ...row, ...change } : row), testimony: undefined }
      : { ...request, ...change };
  return { request: next, notice: {
    id: `${group.id}/removal/${request.id}/${scope ?? 'original'}/${reply?.id ?? 'post'}`,
    recipientId, groupId: group.id, groupName: group.name, kind: 'content_removed', createdAt: now,
    title: `Your ${reply ? 'encouragement' : post ? post.kind : 'prayer request'} was removed by a group ${removal.actorRole}.`,
    message: `Reason: ${groupRemovalReasons[input.reason]}. This applies only to this group’s conversation. Your personal account and other deliveries are unchanged.`,
  } };
}
