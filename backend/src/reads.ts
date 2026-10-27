import { loadDeliveryContext, loadPosts, loadReplies } from './data.ts';
import type { Database } from './data.ts';
import { toDeliveryDto, toPostDto, toReplyDto } from './dto.ts';
import type { BackendEnv } from './env.ts';
import { HttpError, jsonResponse } from './http.ts';
import { canReadDelivery, canReadPost } from './policy.ts';
import type { Actor } from './policy.ts';

const ID = '([A-Za-z0-9_:-]{1,160})';
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function unavailable(): never {
  throw new HttpError(404, 'not_found', 'This item is not available.');
}

async function readableDelivery(db: Database, id: string, actor: Actor | null) {
  const context = await loadDeliveryContext(db, id, actor);
  if (!context || !canReadDelivery(context, actor)) unavailable();
  return context;
}

async function requireCurrentActor(db: Database, actor: Actor | null): Promise<void> {
  if (!actor) return;
  const now = Date.now();
  const current = await db.prepare(`SELECT 1 AS allowed FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.user_id = ? AND s.session_epoch = ? AND s.csrf_hash = ?
      AND s.session_epoch = u.session_epoch AND s.revoked_at IS NULL AND s.expires_at > ?
      AND s.created_at <= ? AND s.authenticated_at <= ? AND u.status = 'active' LIMIT 1`)
    .bind(actor.sessionId, actor.id, actor.sessionEpoch, actor.csrfHash, now, now, now)
    .first<{ allowed: number }>();
  if (!current) unavailable();
}

interface MediaRow {
  id: string;
  owner_id: string;
  feedback_id: string | null;
  delivery_id: string | null;
  post_id: string | null;
  revision: number | null;
  storage_key: string;
  normalized_key: string | null;
  content_type: string;
  state: string;
  deleted_at: number | null;
}

async function approvedMedia(db: Database, id: string): Promise<MediaRow> {
  const media = await db.prepare(`SELECT m.id, m.owner_id, m.feedback_id, m.delivery_id,
    m.post_id, m.revision, m.storage_key, m.normalized_key, m.content_type, m.state, m.deleted_at
    FROM media m JOIN users owner ON owner.id = m.owner_id
    WHERE m.id = ? AND owner.status = 'active' LIMIT 1`).bind(id).first<MediaRow>();
  if (!media || media.deleted_at !== null || media.state !== 'approved'
    || !media.normalized_key?.startsWith('normalized/') || media.normalized_key === media.storage_key
    || !imageTypes.has(media.content_type)) unavailable();

  return media;
}

async function requireMediaAccess(db: Database, media: MediaRow, actor: Actor | null): Promise<void> {
  if (media.feedback_id) {
    if (!actor || actor.id !== media.owner_id) unavailable();
    const feedback = await db.prepare(`SELECT id FROM feedback
      WHERE id = ? AND owner_id = ? AND deleted_at IS NULL AND status != 'deleted' LIMIT 1`)
      .bind(media.feedback_id, actor.id).first<{ id: string }>();
    if (!feedback) unavailable();
  } else {
    if (!media.delivery_id || !media.post_id || media.revision === null) unavailable();
    const context = await readableDelivery(db, media.delivery_id, actor);
    const posts = await loadPosts(db, context, actor);
    const post = posts.find(item => item.id === media.post_id);
    if (!post || !canReadPost(context, post, actor) || post.revision !== media.revision) unavailable();
    const current = await readableDelivery(db, context.id, actor);
    if (!canReadPost(current, post, actor)) unavailable();
  }

}

async function mediaResponse(db: Database, env: BackendEnv, id: string, actor: Actor | null): Promise<Response> {
  const media = await approvedMedia(db, id);
  await requireMediaAccess(db, media, actor);
  // No public URL, HTTP conditional cache, or original object access. Every GET, including
  // one carrying Range, passes the same current authorization before retrieving bytes.
  const object = await env.MEDIA.get(media.normalized_key!);
  if (!object || !('body' in object)) unavailable();
  if (object.size > MAX_IMAGE_BYTES) {
    await object.body.cancel().catch(() => undefined);
    unavailable();
  }
  try {
    const current = await approvedMedia(db, id);
    if (current.normalized_key !== media.normalized_key || current.content_type !== media.content_type
      || current.owner_id !== media.owner_id || current.feedback_id !== media.feedback_id
      || current.delivery_id !== media.delivery_id || current.post_id !== media.post_id
      || current.revision !== media.revision) unavailable();
    await requireMediaAccess(db, current, actor);
    await requireCurrentActor(db, actor);
  } catch (error) {
    await object.body.cancel().catch(() => undefined);
    throw error;
  }
  // Recheck after asynchronous storage reads. Once bytes have reached a reader,
  // later revocation cannot recall that already delivered response.
  return new Response(object.body, {
    headers: {
      'Content-Type': media.content_type,
      'Content-Length': String(object.size),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Accept-Ranges': 'none',
      'Vary': 'Cookie',
    },
  });
}

/** GET routes only. Root applies the request's primary D1 session and authenticates its cookie. */
export async function handleRead(request: Request, db: Database, env: BackendEnv,
  actor: Actor | null): Promise<Response | null> {
  if (request.method !== 'GET') return null;
  const pathname = new URL(request.url).pathname;

  const deliveryMatch = pathname.match(new RegExp(`^/api/deliveries/${ID}$`));
  if (deliveryMatch) {
    const context = await readableDelivery(db, deliveryMatch[1], actor);
    const posts = await loadPosts(db, context, actor);
    const revisions = await db.prepare(`SELECT id,revision FROM posts
      WHERE delivery_id = ? AND status = 'approved' AND deleted_at IS NULL ORDER BY created_at,id LIMIT 100`)
      .bind(context.id).all<{ id: string; revision: number }>();
    const current = await readableDelivery(db, context.id, actor);
    await requireCurrentActor(db, actor);
    return jsonResponse({ delivery: toDeliveryDto(current, actor),
      posts: posts.filter(post => revisions.results.some(item => item.id === post.id && item.revision === post.revision))
        .map(post => toPostDto(current, post, actor)).filter(post => post !== null) });
  }

  const repliesMatch = pathname.match(new RegExp(`^/api/deliveries/${ID}/posts/${ID}/replies$`));
  if (repliesMatch) {
    const context = await readableDelivery(db, repliesMatch[1], actor);
    const posts = await loadPosts(db, context, actor);
    const post = posts.find(item => item.id === repliesMatch[2]);
    if (!post) unavailable();
    const current = await readableDelivery(db, context.id, actor);
    const currentPosts = await loadPosts(db, current, actor);
    const currentPost = currentPosts.find(item => item.id === post.id && item.revision === post.revision);
    if (!currentPost) unavailable();
    const replies = await loadReplies(db, current, currentPost, actor);
    const currentRevision = await db.prepare(`SELECT id FROM posts WHERE id = ? AND delivery_id = ?
      AND revision = ? AND status = 'approved' AND deleted_at IS NULL`)
      .bind(currentPost.id, current.id, currentPost.revision).first<{ id: string }>();
    if (!currentRevision) unavailable();
    const finalContext = await readableDelivery(db, current.id, actor);
    await requireCurrentActor(db, actor);
    return jsonResponse({ replies: replies.map(reply => toReplyDto(finalContext, currentPost, reply, actor))
      .filter(reply => reply !== null) });
  }

  const feedbackMatch = pathname.match(new RegExp(`^/api/feedback/${ID}$`));
  if (feedbackMatch) {
    if (!actor) unavailable();
    const feedback = await db.prepare(`SELECT f.id, f.category, f.body, f.status, f.created_at, f.updated_at
      FROM feedback f JOIN users owner ON owner.id = f.owner_id
      WHERE f.id = ? AND f.owner_id = ? AND owner.status = 'active'
        AND f.deleted_at IS NULL AND f.status != 'deleted' LIMIT 1`)
      .bind(feedbackMatch[1], actor.id).first<{
        id: string; category: string; body: string; status: string; created_at: number; updated_at: number;
      }>();
    if (!feedback) unavailable();
    const attachments = await db.prepare(`SELECT id, state FROM media WHERE feedback_id = ?
      AND owner_id = ? AND deleted_at IS NULL AND state != 'deleted' ORDER BY created_at, id LIMIT 10`)
      .bind(feedback.id, actor.id).all<{ id: string; state: string }>();
    const current = await db.prepare(`SELECT id FROM feedback WHERE id = ? AND owner_id = ?
      AND deleted_at IS NULL AND status != 'deleted'`).bind(feedback.id, actor.id).first<{ id: string }>();
    if (!current) unavailable();
    await requireCurrentActor(db, actor);
    return jsonResponse({ feedback: { id: feedback.id, category: feedback.category, body: feedback.body,
      status: feedback.status, createdAt: feedback.created_at, updatedAt: feedback.updated_at,
      attachments: attachments.results.map(item => ({ id: item.id, status: item.state })) } });
  }

  if (pathname === '/api/notifications') {
    if (!actor) unavailable();
    const notifications = await db.prepare(`
      SELECT n.id, n.kind, n.resource_id, n.created_at, n.read_at
      FROM notifications n JOIN users recipient ON recipient.id = n.recipient_id
      LEFT JOIN feedback f ON n.kind = 'feedback_received' AND f.id = n.resource_id
      LEFT JOIN media m ON n.kind = 'media_review_needed' AND m.id = n.resource_id
      LEFT JOIN feedback mf ON mf.id = m.feedback_id
      WHERE n.recipient_id = ? AND recipient.status = 'active' AND (
        (n.kind = 'feedback_received' AND f.owner_id = n.recipient_id
          AND f.deleted_at IS NULL AND f.status != 'deleted')
        OR (n.kind = 'media_review_needed' AND m.owner_id = n.recipient_id
          AND m.deleted_at IS NULL AND m.state = 'needs_manual_review'
          AND mf.owner_id = n.recipient_id AND mf.deleted_at IS NULL AND mf.status != 'deleted'))
      ORDER BY n.created_at DESC, n.id DESC LIMIT 50
    `).bind(actor.id).all<{
      id: string; kind: 'feedback_received' | 'media_review_needed'; resource_id: string;
      created_at: number; read_at: number | null;
    }>();
    await requireCurrentActor(db, actor);
    return jsonResponse({ notifications: notifications.results.map(item => ({
      id: item.id, kind: item.kind, resourceId: item.resource_id, createdAt: item.created_at,
      readAt: item.read_at,
      message: item.kind === 'feedback_received' ? 'Your feedback has been received.'
        : 'Your attachment is waiting for review.',
    })) });
  }

  const mediaMatch = pathname.match(new RegExp(`^/media/${ID}$`));
  if (mediaMatch) return mediaResponse(db, env, mediaMatch[1], actor);
  return null;
}
