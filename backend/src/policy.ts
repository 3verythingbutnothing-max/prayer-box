export type Visibility = 'everyone' | 'friends' | 'private';
export type Actor = {
  id: string;
  username: string;
  displayName: string;
  status: 'active';
  visibility: Visibility;
  sessionId: string;
  sessionEpoch: number;
  csrfHash: string;
  assurance: 'basic' | 'mfa';
  authenticatedAt: number;
  expiresAt: number;
};

/** Internal policy projection. Never serialize this record into an API response. */
export type DeliveryContext = {
  id: string;
  source_id: string;
  box_id: string;
  audience: Visibility;
  author_ceiling: Visibility;
  box_ceiling: Visibility;
  anonymous: number;
  status: string;
  history_policy: 'personal' | 'at_delivery' | 'retained';
  history_notice_version: string | null;
  group_block_policy: 'hold_on_conflict' | null;
  created_at: number;
  deleted_at: number | null;
  version: number;
  author_id: string;
  author_username: string;
  author_display_name: string;
  author_visibility: Visibility;
  author_status: string;
  source_deleted_at: number | null;
  box_kind: 'personal' | 'organization';
  box_owner_id: string;
  box_name: string;
  box_visibility: Visibility;
  box_status: string;
  box_owner_status: string;
  membership_status: string | null;
  membership_approved_at: number | null;
  membership_revoked_at: number | null;
  membership_official_reply: number | null;
  author_friend: number;
  box_friend: number;
  blocked_with_author: number;
  blocked_with_owner: number;
  blocked_by_box: number;
  personal_block_conflict: number;
  group_block_conflict: number;
};

export type PostRow = {
  id: string;
  delivery_id: string;
  kind: 'request' | 'update' | 'testimony';
  title: string;
  body: string;
  revision: number;
  status: string;
  created_at: number;
  deleted_at: number | null;
};

export type ReplyRow = {
  id: string;
  delivery_id: string;
  post_id: string;
  parent_id: string | null;
  actor_id: string;
  identity_mode: 'personal' | 'anonymous' | 'organization';
  body: string;
  revision: number;
  status: string;
  created_at: number;
  deleted_at: number | null;
  actor_username: string;
  actor_display_name: string;
  actor_status: string;
  blocked_with_viewer: number;
  official_reply_current: number;
};

function ceilingAllows(visibility: Visibility, isFriend: number): boolean {
  return visibility === 'everyone' || (visibility === 'friends' && isFriend === 1);
}

export function isApprovedRecipient(context: DeliveryContext, actor: Actor | null): boolean {
  if (!actor || context.box_kind !== 'organization') return false;
  if (context.membership_status !== 'approved' || context.membership_revoked_at !== null
    || context.membership_approved_at === null || !context.history_notice_version) return false;
  if (context.history_policy === 'retained') return true;
  return context.history_policy === 'at_delivery'
    && context.membership_approved_at <= context.created_at;
}

export function canReadDelivery(context: DeliveryContext, actor: Actor | null): boolean {
  if (actor && actor.status !== 'active') return false;
  if (context.status !== 'approved' || context.deleted_at !== null
    || context.source_deleted_at !== null || context.author_status !== 'active'
    || context.box_status !== 'active') return false;
  // The author's management record remains their own; recipient APIs still omit private source data.
  if (actor?.id === context.author_id) return true;
  if (context.blocked_with_author || context.blocked_by_box) return false;
  if (context.box_kind === 'personal') {
    if (context.history_policy !== 'personal' || context.box_owner_status !== 'active'
      || context.blocked_with_owner || context.personal_block_conflict) return false;
    if (actor?.id === context.box_owner_id) return true;
  } else {
    // Do not implement a secret member exclusion within an all-approved-members audience.
    // This explicit synthetic policy holds the whole group copy; real intake is not enabled.
    if (context.group_block_policy !== 'hold_on_conflict'
      || !context.history_notice_version || context.history_policy === 'personal'
      || context.group_block_conflict) return false;
    if (isApprovedRecipient(context, actor)) return true;
  }
  return ceilingAllows(context.audience, context.author_friend)
    && ceilingAllows(context.author_ceiling, context.author_friend)
    && ceilingAllows(context.author_visibility, context.author_friend)
    && ceilingAllows(context.box_ceiling, context.box_friend)
    && ceilingAllows(context.box_visibility, context.box_friend);
}

export function canReadPost(context: DeliveryContext, post: PostRow, actor: Actor | null): boolean {
  return post.delivery_id === context.id && post.status === 'approved' && post.deleted_at === null
    && canReadDelivery(context, actor);
}

export function canReadReply(context: DeliveryContext, post: PostRow, reply: ReplyRow, actor: Actor | null): boolean {
  return canReadPost(context, post, actor) && reply.delivery_id === context.id
    && reply.post_id === post.id && reply.status === 'approved' && reply.deleted_at === null
    && reply.actor_status === 'active' && !reply.blocked_with_viewer
    && (reply.identity_mode !== 'organization' || (context.box_kind === 'organization'
      && reply.official_reply_current === 1));
}

export function canReplyToPost(context: DeliveryContext, post: PostRow, actor: Actor | null,
  identity: ReplyRow['identity_mode'] = 'personal'): boolean {
  if (!actor || !canReadPost(context, post, actor) || context.blocked_with_author
    || context.blocked_with_owner || context.blocked_by_box || context.group_block_conflict) return false;
  if (identity === 'organization') {
    // An anonymous author cannot disclose their identity through a later organization byline.
    return !(context.anonymous && actor.id === context.author_id)
      && isApprovedRecipient(context, actor) && context.membership_official_reply === 1;
  }
  return true;
}

export type BoxSubmissionContext = {
  kind: 'personal' | 'organization'; ownerId: string; status: string;
  blocked: boolean; historyPolicyApproved: boolean;
};

export function canSubmitToBox(context: BoxSubmissionContext, actor: Actor | null): boolean {
  return !!actor && actor.status === 'active' && context.status === 'active' && !context.blocked
    && context.ownerId !== actor.id && (context.kind === 'personal' || context.historyPolicyApproved);
}

export function canManageMembership(context: {
  kind: string; status: string; ownerId: string; authorityVerifiedAt: number | null;
  ownerMembershipApproved: boolean;
}, actor: Actor | null, now = Date.now()): boolean {
  return !!actor && actor.status === 'active' && actor.id === context.ownerId
    && actor.assurance === 'mfa' && actor.authenticatedAt <= now
    && now - actor.authenticatedAt <= 5 * 60_000 && context.kind === 'organization'
    && context.status === 'active' && context.authorityVerifiedAt !== null
    && context.ownerMembershipApproved;
}
