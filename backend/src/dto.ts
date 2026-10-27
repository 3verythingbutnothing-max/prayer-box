import { canReadDelivery, canReadPost, canReadReply } from './policy.ts';
import type { Actor, DeliveryContext, PostRow, ReplyRow } from './policy.ts';

/** Explicit field lists: source/actor IDs, recipients, audit fields and receipts never spill here. */
export function toDeliveryDto(context: DeliveryContext, actor: Actor | null) {
  if (!canReadDelivery(context, actor)) return null;
  return {
    id: context.id,
    box: { id: context.box_id, name: context.box_name, kind: context.box_kind },
    audience: context.audience,
    anonymous: context.anonymous === 1,
    author: context.anonymous ? { label: 'Anonymous' }
      : { label: context.author_display_name, username: context.author_username },
    createdAt: context.created_at,
    canManage: actor?.id === context.author_id,
  };
}

export function toPostDto(context: DeliveryContext, post: PostRow, actor: Actor | null) {
  if (!canReadPost(context, post, actor)) return null;
  return { id: post.id, deliveryId: post.delivery_id, kind: post.kind, title: post.title,
    body: post.body, createdAt: post.created_at };
}

export function toReplyDto(context: DeliveryContext, post: PostRow, reply: ReplyRow, actor: Actor | null) {
  if (!canReadReply(context, post, reply, actor)) return null;
  const anonymous = reply.identity_mode === 'anonymous'
    || (context.anonymous === 1 && reply.actor_id === context.author_id);
  const byline = anonymous ? { label: 'Anonymous' }
    : reply.identity_mode === 'organization' ? { label: context.box_name }
      : { label: reply.actor_display_name, username: reply.actor_username };
  return { id: reply.id, postId: reply.post_id, parentId: reply.parent_id,
    body: reply.body, createdAt: reply.created_at, byline };
}
