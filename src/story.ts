/** Fictional frontend story/lifecycle rules; server enforcement is still required. */
import { screenText } from "./domain.ts";
import type { PrayerPost, PrayerRequest, Viewer } from "./domain.ts";

export function getStoryPosts(request: PrayerRequest): PrayerPost[] {
  const posts = new Map<string, PrayerPost>();
  if (request.testimony) {
    posts.set(request.testimony.id, {
      ...request.testimony,
      createdAt: request.testimony.createdAt ?? "",
    });
  }
  for (const post of request.posts ?? []) posts.set(post.id, post);
  return [...posts.values()].filter(post => !post.groupRemoval).sort((a, b) => {
    const first = Date.parse(a.createdAt);
    const second = Date.parse(b.createdAt);
    return Number.isFinite(first) && Number.isFinite(second)
      ? first - second
      : 0;
  });
}

/** Resolve only the selected post/reply in this delivery, without falling back. */
export function storyReportEvidence(
  request: PrayerRequest,
  actorId: string,
  replyId?: string,
  postId?: string,
): string | null {
  if (request.groupRemoval) return null;
  const scope = postId === "original" ? undefined : postId;
  const post = scope ? getStoryPosts(request).find((item) => item.id === scope) : undefined;
  if (scope && !post) return null;
  if (replyId) {
    const matches = request.replies.filter((reply) => reply.id === replyId);
    const reply = matches[0];
    return matches.length === 1 && !reply.automatic && !reply.deletedAt && !reply.groupRemoval && reply.actorId === actorId && reply.testimonyId === scope
      ? reply.text
      : null;
  }
  return actorId === request.authorId ? (post?.text ?? request.text) : null;
}

export function formatStoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not recorded"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
}

/** Only published author posts return a prayed-for request to the active list. */
export function storyRevision(request: PrayerRequest): string {
  return JSON.stringify([
    request.id,
    ...getStoryPosts(request).map((post) => post.id),
  ]);
}

export function hasPrayedForLatest(
  request: PrayerRequest,
  viewer: Viewer,
): boolean {
  if (
    viewer === "guest" ||
    request.authorId === viewer ||
    request.groupRemoval || request.moderation !== "approved"
  )
    return false;
  const revision = storyRevision(request);
  const originalOnly = getStoryPosts(request).length === 0;
  const latestPost = getStoryPosts(request).at(-1);
  return request.replies.some(
    (reply) =>
      reply.actorId === viewer &&
      !reply.automatic && !reply.groupRemoval && !reply.deletedAt &&
      (originalOnly || reply.testimonyId === latestPost?.id) &&
      (reply.storyRevision === revision ||
        (!reply.storyRevision && originalOnly && !reply.testimonyId)),
  );
}

/** Exact-author filtering applies even if a caller supplies someone else's IDs. */
export function withdrawOwnDeliveries(
  requests: PrayerRequest[],
  viewer: Viewer,
  deliveryIds: readonly string[],
): PrayerRequest[] {
  if (viewer === "guest") return requests;
  const selected = new Set(deliveryIds);
  return requests.filter(
    (request) => request.authorId !== viewer || !selected.has(request.id),
  );
}

/** Author-selected publication appends; it never overwrites earlier testimony. */
export function publishStoryPost(
  requests: PrayerRequest[],
  viewer: Viewer,
  deliveryIds: readonly string[],
  publication: Omit<PrayerPost, "id">,
  createId: () => string,
): PrayerRequest[] {
  if (viewer === "guest") return requests;
  const selected = new Set(deliveryIds);
  return requests.map((request) =>
    request.authorId === viewer &&
    !request.groupRemoval && request.moderation === "approved" &&
    selected.has(request.id)
      ? {
          ...request,
          posts: [...(request.posts ?? []), { ...publication, id: createId() }],
        }
      : request,
  );
}

/** Recheck current posting and original-delivery state before releasing a held draft. */
export function storyPublicationPlan(
  requests: PrayerRequest[],
  author: Viewer,
  deliveryIds: readonly string[],
  postingRestricted = false,
): { ready: string[]; held: string[] } {
  const selected = [...new Set(deliveryIds)];
  const ready =
    author === "guest" || postingRestricted
      ? []
      : requests
          .filter(
            (request) =>
              request.authorId === author &&
              !request.groupRemoval && request.moderation === "approved" &&
              selected.includes(request.id),
          )
          .map((request) => request.id);
  return { ready, held: selected.filter((id) => !ready.includes(id)) };
}


export type TextEditTarget = { postId?: string; replyId?: string };
export type TextEditResult = { request: PrayerRequest; state: "saved" | "pending" | "denied" | "conflict" | "invalid"; message: string };

/** Exact-copy edits only. This bounded fictional screen is not production moderation. */
export function editOwnStoryText(request: PrayerRequest, viewer: Viewer, target: TextEditTarget,
  input: { text: string; title?: string; expectedRevision: number }, now: string,
  postingRestricted = false): TextEditResult {
  const deny = (state: TextEditResult["state"], message: string): TextEditResult => ({ request, state, message });
  if (viewer === "guest" || postingRestricted || request.groupRemoval) return deny("denied", "Posting is unavailable for this account.");
  if (!Number.isFinite(Date.parse(now)) || !input.text.trim() || input.text.trim().length > 4000
    || (!target.postId && !target.replyId && (!input.title?.trim() || input.title.trim().length > 160)))
    return deny("invalid", "Add a title up to 160 characters and text up to 4,000 characters.");
  const post = target.postId ? getStoryPosts(request).find(row => row.id === target.postId) : undefined;
  if (target.postId && !post) return deny("denied", "That part of the story is no longer available.");
  const replies = target.replyId ? request.replies.filter(row => row.id === target.replyId && row.testimonyId === target.postId) : [];
  const reply = replies[0];
  if (target.replyId ? replies.length !== 1 || reply?.actorId !== viewer || reply.automatic || reply.deletedAt || reply.groupRemoval
    : request.authorId !== viewer) return deny("denied", "Only the author can edit these words.");
  const item = reply ?? post ?? request;
  if ((item.revision ?? 1) !== input.expectedRevision) return deny("conflict", "This post changed while you were editing. Reopen it to use the latest version.");
  const title = !target.postId && !target.replyId ? input.title!.trim() : undefined;
  const text = input.text.trim();
  if (text === item.text && (title === undefined || title === request.topic))
    return deny("saved", "These words are unchanged. The posting and edit dates are preserved.");
  const check = screenText(`${title ?? ""} ${text}`);
  const held = check.state !== "approved";
  const reason = check.reason.replace(" You can appeal if we misunderstood.", "");
  const changes = held ? { pendingEdit: { text, title, submittedAt: now, expectedRevision: input.expectedRevision, reason } }
    : { text, editedAt: now, revision: input.expectedRevision + 1, pendingEdit: undefined };
  let updated: PrayerRequest;
  if (reply) updated = { ...request, replies: request.replies.map(row => row.id === reply.id ? { ...row, ...changes } : row) };
  else if (post) updated = { ...request,
    posts: getStoryPosts(request).map(row => row.id === post.id ? { ...row, ...changes } : row),
    testimony: request.testimony?.id === post.id ? undefined : request.testimony };
  else updated = { ...request, ...changes, ...(held ? {} : { topic: title!, moderation: "approved" as const, reviewReason: undefined }) };
  return { request: updated, state: held ? "pending" : "saved", message: held
    ? `${reason} Your earlier version stays visible while this edit is held for review.`
    : "Your changes are saved for this prayer box. The original posting date is preserved." };
}

/** A tombstone preserves replies from other people without retaining the deleted text. */
export function removeOwnEncouragement(request: PrayerRequest, viewer: Viewer, target: TextEditTarget, now: string): PrayerRequest {
  if (viewer === "guest" || !target.replyId || !Number.isFinite(Date.parse(now))) return request;
  const matches = request.replies.filter(row => row.id === target.replyId && row.testimonyId === target.postId);
  const row = matches[0];
  if (matches.length !== 1 || row.actorId !== viewer || row.automatic || row.deletedAt || row.groupRemoval) return request;
  return { ...request, replies: request.replies.map(item => item.id === row.id
    ? { ...item, text: "", deletedAt: now, pendingEdit: undefined, agreedBy: [] } : item) };
}

/** An exact pending-edit timestamp prevents cancelling a newer draft by mistake. */
export function cancelOwnPendingEdit(request: PrayerRequest, viewer: Viewer, target: TextEditTarget,
  submittedAt: string): PrayerRequest {
  const post = target.postId ? getStoryPosts(request).find(row => row.id === target.postId) : undefined;
  const reply = target.replyId ? request.replies.find(row => row.id === target.replyId && row.testimonyId === target.postId) : undefined;
  if (viewer === 'guest' || target.postId && !post || target.replyId && (!reply || reply.automatic || reply.actorId !== viewer)
    || !target.replyId && request.authorId !== viewer) return request;
  const item = reply ?? post ?? request;
  if (item.pendingEdit?.submittedAt !== submittedAt) return request;
  if (reply) return { ...request, replies: request.replies.map(row => row.id === reply.id ? { ...row, pendingEdit: undefined } : row) };
  if (post) return { ...request, posts: getStoryPosts(request).map(row => row.id === post.id ? { ...row, pendingEdit: undefined } : row), testimony: request.testimony?.id === post.id ? undefined : request.testimony };
  return { ...request, pendingEdit: undefined };
}
