/** Conversation presentation rules for the fictional frontend. Not authorization. */
import type { Reply } from "./domain.ts";

/**
 * Keep each conversation in its selected story post. A nested reply appears only
 * when its entire ancestry is visible, nonautomatic, and in the same post.
 * Missing or duplicate IDs and cyclic ancestry fail closed.
 */
export function scopedStoryReplies(
  replies: readonly Reply[],
  postId: string | undefined,
  blockedActors: readonly string[],
  canSeeAutomatic: boolean,
): Reply[] {
  const blocked = new Set(blockedActors);
  const counts = new Map<string, number>();
  for (const reply of replies) counts.set(reply.id, (counts.get(reply.id) ?? 0) + 1);
  const candidates = replies.filter((reply) =>
    counts.get(reply.id) === 1 &&
    reply.testimonyId === postId &&
    (!reply.actorId || !blocked.has(reply.actorId)) &&
    (!reply.automatic || canSeeAutomatic),
  );
  const byId = new Map(candidates.map((reply) => [reply.id, reply]));
  return candidates.filter((reply) => {
    const seen = new Set([reply.id]);
    let current = reply;
    while (current.parentReplyId) {
      const parent = byId.get(current.parentReplyId);
      if (!parent || parent.automatic || seen.has(parent.id)) return false;
      seen.add(parent.id);
      current = parent;
    }
    return true;
  });
}
