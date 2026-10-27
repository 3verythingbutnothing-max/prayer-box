/** Fictional frontend story/lifecycle rules; server enforcement is still required. */
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
  return [...posts.values()].sort((a, b) => {
    const first = Date.parse(a.createdAt);
    const second = Date.parse(b.createdAt);
    return Number.isFinite(first) && Number.isFinite(second)
      ? first - second
      : 0;
  });
}

export function formatStoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not recorded"
    : new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
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
    request.moderation !== "approved"
  )
    return false;
  const revision = storyRevision(request);
  const originalOnly = getStoryPosts(request).length === 0;
  const latestPost = getStoryPosts(request).at(-1);
  return request.replies.some(
    (reply) =>
      reply.actorId === viewer &&
      !reply.automatic &&
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
    request.moderation === "approved" &&
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
              request.moderation === "approved" &&
              selected.includes(request.id),
          )
          .map((request) => request.id);
  return { ready, held: selected.filter((id) => !ready.includes(id)) };
}
