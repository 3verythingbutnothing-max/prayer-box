import type { Database } from './data.ts';
import type { Actor } from './policy.ts';
import { HttpError } from './http.ts';

type EditInput = { title: string; body: string; expectedRevision: number };
type StoredEdit = { id: string; post_id: string; expected_revision: number; title: string; body: string; state: string; submitted_at: number; cancelled_at: number | null };
const dto = (row: StoredEdit) => ({ id: row.id, postId: row.post_id, expectedRevision: row.expected_revision,
  title: row.title, body: row.body, status: row.state, submittedAt: row.submitted_at, cancelledAt: row.cancelled_at });

function parseEdit(input: Record<string, unknown>): EditInput {
  if (Object.keys(input).some(key => !['title', 'body', 'expectedRevision'].includes(key))
    || typeof input.title !== 'string' || !input.title.trim() || input.title.trim().length > 160
    || typeof input.body !== 'string' || !input.body.trim() || input.body.trim().length > 4000
    || !Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
    throw new HttpError(400, 'invalid_edit', 'Use a title up to 160 characters and text up to 4,000 characters, with the current version of the post.');
  }
  return { title: input.title.trim(), body: input.body.trim(), expectedRevision: Number(input.expectedRevision) };
}

/** This exact-session snapshot is checked both on reading a proposal and inside its insert. */
const ownership = `FROM posts p JOIN deliveries d ON d.id=p.delivery_id
  JOIN authored_sources a ON a.id=d.source_id JOIN users u ON u.id=a.author_id
  JOIN sessions s ON s.user_id=u.id JOIN boxes b ON b.id=d.box_id
  WHERE p.id=? AND d.id=? AND a.author_id=? AND s.id=? AND s.session_epoch=? AND s.csrf_hash=?
    AND s.session_epoch=u.session_epoch AND s.revoked_at IS NULL AND s.expires_at>?
    AND s.created_at<=? AND s.authenticated_at<=? AND u.status='active'
    AND p.deleted_at IS NULL AND p.status!='deleted' AND d.deleted_at IS NULL AND d.status!='deleted'
    AND a.deleted_at IS NULL AND b.status='active'`;
const args = (actor: Actor, deliveryId: string, postId: string, now: number) =>
  [postId, deliveryId, actor.id, actor.sessionId, actor.sessionEpoch, actor.csrfHash, now, now, now];
async function ownPost(db: Database, actor: Actor, deliveryId: string, postId: string) {
  const row = await db.prepare(`SELECT p.title,p.body,p.revision ${ownership}`)
    .bind(...args(actor, deliveryId, postId, Date.now())).first<{ title: string; body: string; revision: number }>();
  if (!row) throw new HttpError(404, 'not_found', 'This story post is not available.');
  return row;
}

export async function loadOwnPostEdits(db: Database, actor: Actor, deliveryId: string, postId: string) {
  await ownPost(db, actor, deliveryId, postId);
  const result = await db.prepare(`SELECT id,post_id,expected_revision,title,body,state,submitted_at,cancelled_at FROM post_edits
    WHERE owner_id=? AND delivery_id=? AND post_id=? ORDER BY submitted_at DESC,id DESC LIMIT 20`)
    .bind(actor.id, deliveryId, postId).all<StoredEdit>();
  await ownPost(db, actor, deliveryId, postId);
  return { edits: result.results.map(dto) };
}

/** Root enforces same-origin + CSRF. No scanner is configured: all edits await a person. */
export async function submitPostEdit(db: Database, actor: Actor, deliveryId: string, postId: string,
  raw: Record<string, unknown>) {
  const input = parseEdit(raw);
  const post = await ownPost(db, actor, deliveryId, postId);
  if (post.revision !== input.expectedRevision) throw new HttpError(409, 'edit_conflict', 'This post changed. Refresh its current version; your draft has not been sent.', true);
  if (post.title === input.title && post.body === input.body) return { status: 'unchanged', postId, revision: post.revision };
  async function replay() {
    const current = await ownPost(db, actor, deliveryId, postId);
    if (current.revision !== input.expectedRevision) throw new HttpError(409, 'edit_conflict', 'This post changed. Refresh its current version; your draft has not been sent.', true);
    const existing = await db.prepare(`SELECT id,post_id,expected_revision,title,body,state,submitted_at,cancelled_at FROM post_edits
      WHERE owner_id=? AND delivery_id=? AND post_id=? AND expected_revision=? AND state='pending' LIMIT 1`)
      .bind(actor.id, deliveryId, postId, input.expectedRevision).first<StoredEdit>();
    if (!existing) return null;
    if (existing.title !== input.title || existing.body !== input.body) throw new HttpError(409, 'edit_pending', 'An edit for this version is already awaiting review. Your new draft has not replaced it.', true);
    await ownPost(db, actor, deliveryId, postId);
    return dto(existing);
  }
  const prior = await replay();
  if (prior) return prior;
  const now = Date.now();
  const hour = 3_600_000;
  const count = await db.prepare(`INSERT INTO rate_buckets(key,window_start,count) VALUES(?,?,1)
    ON CONFLICT(key,window_start) DO UPDATE SET count=MIN(count+1,1000000) RETURNING count`)
    .bind(`post-edit:${actor.id}`, Math.floor(now/hour)*hour).first<number>('count');
  if (count === null || count > 20) throw new HttpError(429, 'edit_rate_limited', 'Please wait before sending more changes.', true);
  const id = crypto.randomUUID();
  const acceptedAt = Date.now();
  try {
    const result = await db.prepare(`INSERT INTO post_edits(id,post_id,delivery_id,owner_id,expected_revision,title,body,submitted_at)
      SELECT ?,p.id,d.id,u.id,?,?,?,? ${ownership} AND p.revision=?`)
      .bind(id, input.expectedRevision, input.title, input.body, acceptedAt, ...args(actor, deliveryId, postId, acceptedAt), input.expectedRevision).run();
    if (result.meta.changes !== 1) {
      await ownPost(db, actor, deliveryId, postId);
      throw new HttpError(409, 'edit_conflict', 'This post changed while saving. Your draft has not been sent.', true);
    }
  } catch (error) {
    const concurrent = await replay();
    if (concurrent) return concurrent;
    throw error;
  }
  return { id, postId, expectedRevision: input.expectedRevision, title: input.title, body: input.body, status: 'pending', submittedAt: acceptedAt, cancelledAt: null };
}

/** Withdrawing a proposal never changes the published post or erases its audit timestamp. */
export async function cancelOwnPostEdit(db: Database, actor: Actor, deliveryId: string, postId: string, editId: string) {
  await ownPost(db, actor, deliveryId, postId);
  const now = Date.now();
  const result = await db.prepare(`UPDATE post_edits SET state='cancelled',cancelled_at=?
    WHERE id=? AND owner_id=? AND delivery_id=? AND post_id=? AND state='pending'
      AND EXISTS(SELECT 1 ${ownership})`)
    .bind(now, editId, actor.id, deliveryId, postId, ...args(actor, deliveryId, postId, now)).run();
  if (result.meta.changes === 1) return { id: editId, status: 'cancelled', cancelledAt: now };
  await ownPost(db, actor, deliveryId, postId);
  const prior = await db.prepare('SELECT state,cancelled_at FROM post_edits WHERE id=? AND owner_id=? AND delivery_id=? AND post_id=?')
    .bind(editId, actor.id, deliveryId, postId).first<{ state: string; cancelled_at: number | null }>();
  if (!prior) throw new HttpError(404, 'not_found', 'This edit is not available.');
  if (prior.state === 'cancelled') return { id: editId, status: 'cancelled', cancelledAt: prior.cancelled_at };
  throw new HttpError(409, 'edit_already_reviewed', 'This edit has already been reviewed. Refresh the post to see its current version.', true);
}
