/** Session-only fictional review workflow. These guards are not server authorization. */
import { canViewRequest } from './domain.ts';
import type { BoxId, DemoAccessContext, PrayerRequest, Reply, Viewer } from './domain.ts';
import { hasMedia, maxAudioSeconds, maxMediaPhotos, mediaReady } from './media-draft.ts';
import type { MediaDraftSnapshot } from './media-draft.ts';
import type { GroupState } from './prayer-groups.ts';
import { getStoryPosts } from './story.ts';
import { scopedStoryReplies } from './story-replies.ts';

export type MediaReplyDraft = {
  requestId: string;
  actorId: Viewer;
  postId?: string;
  parentReplyId?: string;
  text: string;
  media: MediaDraftSnapshot;
  storyRevision: string;
  byline: string;
  official: boolean;
  membershipRequired: boolean;
};
export type HeldMediaReply = MediaReplyDraft & {
  id: string;
  submittedAt: string;
  state: 'pending' | 'changes' | 'appeal';
  reason: string;
};
export type MediaReplyContext = {
  requests: readonly PrayerRequest[];
  groups: GroupState;
  restricted: readonly string[];
  blocks: readonly { blockerId: string; blockedId: string }[];
  removedByBox: Partial<Record<BoxId, readonly string[]>>;
  access: DemoAccessContext;
};
export type MediaReplyQueueResult = { ok: boolean; message: string };
const scopeKey = (draft: MediaReplyDraft) => JSON.stringify([draft.requestId, draft.actorId, draft.postId ?? null, draft.parentReplyId ?? null]);

/** Recheck current facts on both enqueue and human approval; never retarget a reply. */
export function mediaReplyEligibility(draft: MediaReplyDraft, context: MediaReplyContext): MediaReplyQueueResult {
  const deny = (message: string) => ({ ok: false, message });
  if (draft.actorId === 'guest' || context.restricted.includes(draft.actorId)) return deny('The response author cannot currently post. The response remains unpublished.');
  if (!draft.text.trim() || draft.text.length > 5000 || !draft.byline.trim() || !draft.storyRevision) return deny('The response is incomplete. Its draft has been preserved.');
  if (!hasMedia(draft.media) || !mediaReady(draft.media) || draft.media.photos.length > maxMediaPhotos || draft.media.audio && (!Number.isFinite(draft.media.audio.seconds) || draft.media.audio.seconds < 0 || draft.media.audio.seconds > maxAudioSeconds || draft.media.audio.transcript.length > 5000)) return deny('Finish checking the attachments and transcript before submitting.');
  const matches = context.requests.filter(row => row.id === draft.requestId);
  const request = matches[0];
  if (matches.length !== 1 || !request || request.groupRemoval || request.moderation !== 'approved') return deny('The original delivery is no longer available for responses. Nothing was published.');
  if (!canViewRequest(request, draft.actorId, context.access)) return deny('The author no longer has access to this delivery. Nothing was published.');
  const group = request.recipient === 'grace' ? context.groups.find(row => row.id === 'grace') : undefined;
  const member = group?.members.find(row => row.id === draft.actorId);
  if (request.recipient === 'grace' && (!group || group.archivedAt || member?.status === 'blocked')) return deny('This group or its delivery access is no longer available.');
  if (draft.membershipRequired && (!group || !member?.active || member.status !== 'approved')) return deny('Approved, active group membership is required for this response.');
  if (draft.official && (!group || !member?.active || member.status !== 'approved' || !member.officialReply)) return deny('Permission to reply as this group has changed. The official response remains unpublished.');
  const boxOwner = request.recipient === 'mine' ? 'elena' : request.recipient === 'grace' ? group?.ownerId : request.recipient === 'prayerbox' ? 'team' : request.recipient;
  const removed = context.removedByBox[request.recipient] ?? [];
  if (removed.includes(request.authorId) || removed.includes(draft.actorId)) return deny('This response is no longer permitted in this prayer box.');
  const blockedForActor = context.blocks.flatMap(row => row.blockerId === draft.actorId ? [row.blockedId] : row.blockedId === draft.actorId ? [row.blockerId] : []);
  const parent = draft.parentReplyId ? scopedStoryReplies(request.replies, draft.postId, blockedForActor, false).find(row => row.id === draft.parentReplyId && !row.deletedAt && !row.automatic) : undefined;
  if (draft.postId && !getStoryPosts(request).some(row => row.id === draft.postId)) return deny('That exact update or testimony is no longer available. The response was not moved to another post.');
  if (draft.parentReplyId && !parent) return deny('The encouragement being answered is no longer available in this part of the story.');
  if (request.authorId === draft.actorId && !parent) return deny('Add an update or testimony to your own request, or reply to an existing encouragement.');
  const targets = [request.authorId, boxOwner, parent?.actorId].filter((id): id is string => !!id && id !== draft.actorId);
  if (context.blocks.some(row => row.blockerId === draft.actorId && targets.includes(row.blockedId) || row.blockedId === draft.actorId && targets.includes(row.blockerId))) return deny('A current block prevents this interaction. Nothing was published.');
  return { ok: true, message: 'Eligible for a human review decision.' };
}

export function queueMediaReply(queue: readonly HeldMediaReply[], draft: MediaReplyDraft, context: MediaReplyContext, id: string, now: string) {
  const eligibility = mediaReplyEligibility(draft, context);
  if (!eligibility.ok) return { ...eligibility, queue: [...queue], state: 'denied' as const };
  if (queue.some(row => scopeKey(row) === scopeKey(draft))) return { ok: false, queue: [...queue], state: 'duplicate' as const, message: 'You already have a response in review for this part of the conversation. Cancel it before submitting a replacement; your current draft is unchanged.' };
  const entry: HeldMediaReply = { ...structuredClone(draft), id, submittedAt: now, state: 'pending', reason: 'Awaiting human review. Words, attachments, and transcript have not been shared.' };
  return { ok: true, queue: [...queue, entry], state: 'queued' as const, message: 'Your sample response is in the review queue. It stays available when you leave this page during this preview session.' };
}

export function approveMediaReply(queue: readonly HeldMediaReply[], id: string, reviewer: Viewer, context: MediaReplyContext, replyId: string, now: string) {
  const requestCopies = [...context.requests];
  const row = queue.find(item => item.id === id);
  const denied = (message: string) => ({ ok: false, message, requests: requestCopies, queue: [...queue] });
  if (reviewer !== 'operator' || !row || row.state === 'changes') return denied('A pending response and a reviewer decision are required. Nothing was published.');
  const eligibility = mediaReplyEligibility(row, context);
  if (!eligibility.ok) return { ...denied(eligibility.message), queue: queue.map(item => item.id === id ? { ...item, reason: eligibility.message } : item) };
  if (context.requests.some(request => request.replies.some(reply => reply.id === replyId))) return denied('This review decision already exists. Nothing was duplicated.');
  const reply: Reply = { id: replyId, actorId: row.actorId, name: row.byline, text: row.text.trim(), official: row.official, audio: !!row.media.audio, testimonyId: row.postId, parentReplyId: row.parentReplyId, postedAt: now, storyRevision: row.storyRevision, previewMedia: structuredClone(row.media), mediaReview: 'approved' };
  return { ok: true, message: 'The sample response was approved for its original delivery and exact part of the story.', requests: context.requests.map(request => request.id === row.requestId ? { ...request, replies: [...request.replies, reply] } : request), queue: queue.filter(item => item.id !== id) };
}

export function cancelMediaReply(queue: readonly HeldMediaReply[], id: string, actor: Viewer): HeldMediaReply[] {
  return queue.filter(row => row.id !== id || row.actorId !== actor);
}
