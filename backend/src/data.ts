import { canReadDelivery, canReadPost, canReadReply } from './policy.ts';
import type { Actor, DeliveryContext, PostRow, ReplyRow, Visibility } from './policy.ts';

export type Database = Pick<D1Database, 'prepare' | 'batch'>;

/** Start each authorization-sensitive request here; do not accept a browser bookmark. */
export function primary(database: D1Database): D1DatabaseSession {
  return database.withSession('first-primary');
}

export async function hashSecret(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function loadActor(database: Database, token: string | null | undefined,
  now = Date.now()): Promise<Actor | null> {
  if (!token || token.length < 32 || token.length > 256) return null;
  const row = await database.prepare(`
    SELECT u.id, u.username, u.display_name, u.visibility, s.id AS session_id,
      s.csrf_hash, s.session_epoch, s.assurance, s.authenticated_at, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?
      AND s.created_at <= ? AND s.authenticated_at <= ?
      AND s.session_epoch = u.session_epoch AND u.status = 'active'
      AND NOT EXISTS(SELECT 1 FROM auth_identities i WHERE i.user_id=u.id AND i.recovery_lock IS NOT NULL)
    LIMIT 1
  `).bind(await hashSecret(token), now, now, now).first<{
    id: string; username: string; display_name: string; visibility: Visibility; session_id: string;
    csrf_hash: string; session_epoch: number; assurance: 'basic' | 'mfa'; authenticated_at: number; expires_at: number;
  }>();
  return row ? {
    id: row.id, username: row.username, displayName: row.display_name, status: 'active',
    visibility: row.visibility, sessionId: row.session_id, sessionEpoch: row.session_epoch,
    csrfHash: row.csrf_hash, assurance: row.assurance, authenticatedAt: row.authenticated_at,
    expiresAt: row.expires_at,
  } : null;
}

/** Internal facts from one primary SQL statement; callers must use policy and allowlisted DTOs. */
export async function loadDeliveryContext(database: Database, id: string, actor: Actor | null,
  now = Date.now()): Promise<DeliveryContext | null> {
  const viewer = actor?.id ?? '';
  return database.prepare(`
    SELECT d.*, s.author_id, s.deleted_at AS source_deleted_at,
      a.username AS author_username, a.display_name AS author_display_name,
      a.visibility AS author_visibility, a.status AS author_status,
      b.kind AS box_kind, b.owner_id AS box_owner_id, b.display_name AS box_name,
      b.visibility AS box_visibility, b.status AS box_status, owner.status AS box_owner_status,
      m.status AS membership_status, m.approved_at AS membership_approved_at,
      m.revoked_at AS membership_revoked_at, m.official_reply AS membership_official_reply,
      EXISTS(SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND
        ((f.user_a = ?1 AND f.user_b = a.id) OR (f.user_a = a.id AND f.user_b = ?1))) AS author_friend,
      CASE WHEN b.kind = 'personal' THEN EXISTS(SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND
        ((f.user_a = ?1 AND f.user_b = b.owner_id) OR (f.user_a = b.owner_id AND f.user_b = ?1)))
      ELSE EXISTS(SELECT 1 FROM box_circle c WHERE c.box_id = b.id AND c.user_id = ?1 AND c.status = 'accepted') END AS box_friend,
      EXISTS(SELECT 1 FROM blocks x WHERE (x.blocker_id = ?1 AND x.blocked_id = a.id)
        OR (x.blocker_id = a.id AND x.blocked_id = ?1)) AS blocked_with_author,
      EXISTS(SELECT 1 FROM blocks x WHERE (x.blocker_id = ?1 AND x.blocked_id = b.owner_id)
        OR (x.blocker_id = b.owner_id AND x.blocked_id = ?1)) AS blocked_with_owner,
      EXISTS(SELECT 1 FROM box_blocks x WHERE x.box_id = b.id AND x.user_id IN (?1,a.id)) AS blocked_by_box,
      EXISTS(SELECT 1 FROM blocks x WHERE (x.blocker_id = a.id AND x.blocked_id = b.owner_id)
        OR (x.blocker_id = b.owner_id AND x.blocked_id = a.id)) AS personal_block_conflict,
      (EXISTS(SELECT 1 FROM memberships gm JOIN users gu ON gu.id = gm.user_id
        JOIN blocks gx ON ((gx.blocker_id = a.id AND gx.blocked_id = gm.user_id)
          OR (gx.blocked_id = a.id AND gx.blocker_id = gm.user_id))
        WHERE gm.box_id = b.id AND gm.status = 'approved' AND gm.approved_at <= ?3
          AND gm.revoked_at IS NULL AND gu.status = 'active')
        OR EXISTS(SELECT 1 FROM memberships gm JOIN users gu ON gu.id = gm.user_id
          JOIN box_blocks bx ON bx.box_id = gm.box_id AND bx.user_id = gm.user_id
          WHERE gm.box_id = b.id AND gm.status = 'approved' AND gm.approved_at <= ?3
            AND gm.revoked_at IS NULL AND gu.status = 'active')) AS group_block_conflict
    FROM deliveries d
    JOIN authored_sources s ON s.id = d.source_id
    JOIN users a ON a.id = s.author_id
    JOIN boxes b ON b.id = d.box_id
    JOIN users owner ON owner.id = b.owner_id
    LEFT JOIN memberships m ON m.box_id = b.id AND m.user_id = ?1 AND m.approved_at <= ?3
    WHERE d.id = ?2 LIMIT 1
  `).bind(viewer, id, now).first<DeliveryContext>();
}

export async function loadPosts(database: Database, context: DeliveryContext,
  actor: Actor | null): Promise<PostRow[]> {
  if (!canReadDelivery(context, actor)) return [];
  const result = await database.prepare(`SELECT id, delivery_id, kind, title, body, revision,
    status, created_at, edited_at, deleted_at FROM posts WHERE delivery_id = ? AND status = 'approved'
    AND deleted_at IS NULL ORDER BY created_at, id LIMIT 100`).bind(context.id).all<PostRow>();
  return result.results.filter(post => canReadPost(context, post, actor));
}

export async function loadReplies(database: Database, context: DeliveryContext,
  post: PostRow, actor: Actor | null, now = Date.now()): Promise<ReplyRow[]> {
  if (!canReadPost(context, post, actor)) return [];
  const result = await database.prepare(`
    SELECT r.*, a.username AS actor_username, a.display_name AS actor_display_name, a.status AS actor_status,
      EXISTS(SELECT 1 FROM blocks x WHERE (x.blocker_id = ?1 AND x.blocked_id = a.id)
        OR (x.blocker_id = a.id AND x.blocked_id = ?1)) AS blocked_with_viewer,
      EXISTS(SELECT 1 FROM memberships m WHERE m.box_id = ?4 AND m.user_id = a.id
        AND m.status = 'approved' AND m.approved_at <= ?5 AND m.revoked_at IS NULL
        AND m.official_reply = 1) AS official_reply_current
    FROM replies r JOIN users a ON a.id = r.actor_id
    JOIN posts current_post ON current_post.id = r.post_id AND current_post.delivery_id = r.delivery_id
    WHERE current_post.status = 'approved' AND current_post.deleted_at IS NULL AND current_post.revision = ?6
      AND r.delivery_id = ?2 AND r.post_id = ?3 AND r.status = 'approved'
      AND r.deleted_at IS NULL ORDER BY r.created_at, r.id LIMIT 200
  `).bind(actor?.id ?? '', context.id, post.id, context.box_id, now, post.revision).all<ReplyRow>();
  const allowed = result.results.filter(reply => canReadReply(context, post, reply, actor));
  // No orphaned or cross-context reply references: a hidden parent hides its descendants.
  const visible = new Set(allowed.filter(reply => reply.parent_id === null).map(reply => reply.id));
  return allowed.filter(reply => reply.parent_id === null || visible.has(reply.parent_id));
}
