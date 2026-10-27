import type { Actor } from "./policy.ts";
import type { Database } from "./data.ts";
import type { BackendEnv } from "./env.ts";
import { HttpError, jsonResponse, readBoundedBytes } from "./http.ts";

const MAX_PICTURE_BYTES = 5 * 1024 * 1024;
const MAX_PICTURES = 3;
const HOUR_MS = 3_600_000;
const MAX_UPLOAD_ATTEMPTS = 12;
const ID_KEY = /^[A-Za-z0-9_-]{8,100}$/;

function sessionGuard(): string {
  return `EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.user_id = ? AND s.session_epoch = ? AND s.csrf_hash = ? AND u.session_epoch = s.session_epoch
      AND s.revoked_at IS NULL AND s.expires_at > ? AND s.created_at <= ?
      AND s.authenticated_at <= ? AND u.status = 'active')`;
}

function sessionValues(actor: Actor, at: number): (string | number)[] {
  return [actor.sessionId, actor.id, actor.sessionEpoch, actor.csrfHash, at, at, at];
}

function feedbackGuard(): string {
  return `EXISTS (SELECT 1 FROM feedback f WHERE f.id = ? AND f.owner_id = ?
    AND f.status IN ('received','needs_manual_review') AND f.deleted_at IS NULL)`;
}

function validPictureSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return bytes.length >= 8 && signature.every((byte, index) => bytes[index] === byte);
  }
  if (contentType === "image/jpeg") {
    return bytes.length >= 5 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
  }
  if (contentType === "image/webp") {
    return bytes.length >= 20 && new TextDecoder().decode(bytes.subarray(0, 4)) === "RIFF"
      && new TextDecoder().decode(bytes.subarray(8, 12)) === "WEBP"
      && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) === bytes.length - 8
      && ["VP8 ", "VP8L", "VP8X"].includes(new TextDecoder().decode(bytes.subarray(12, 16)));
  }
  return false;
}

async function hexHash(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentFeedback(db: Database, actor: Actor, feedbackId: string, at: number): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS allowed WHERE ${feedbackGuard()} AND ${sessionGuard()}`)
    .bind(feedbackId, actor.id, ...sessionValues(actor, at)).first<{ allowed: number }>();
  return row?.allowed === 1;
}

async function reserveUploadAttempt(db: Database, actor: Actor, at: number): Promise<void> {
  const windowStart = Math.floor(at / HOUR_MS) * HOUR_MS;
  const allowed = await db.prepare(`
    INSERT INTO rate_buckets(key,window_start,count)
    SELECT ?, ?, 1 WHERE ${sessionGuard()}
    ON CONFLICT(key,window_start) DO UPDATE SET count = rate_buckets.count + 1
      WHERE rate_buckets.count < ? AND ${sessionGuard()}
    RETURNING count
  `).bind(`upload:${actor.id}`, windowStart, ...sessionValues(actor, at), MAX_UPLOAD_ATTEMPTS,
    ...sessionValues(actor, at)).first<{ count: number }>();
  if (!allowed) throw new HttpError(429, "upload_limit", "Please wait before uploading another picture.", true);
}

async function priorUpload(
  db: Database, actor: Actor, key: string, hash: string, feedbackId: string, at: number,
): Promise<Response | null> {
  const prior = await db.prepare(`SELECT i.request_hash, i.resource_id,
      m.feedback_id, m.owner_id, m.state, m.deleted_at
    FROM idempotency i LEFT JOIN media m ON m.id = i.resource_id
    WHERE i.owner_id = ? AND i.key = ? AND ${feedbackGuard()} AND ${sessionGuard()}`)
    .bind(actor.id, key, feedbackId, actor.id, ...sessionValues(actor, at)).first<{
      request_hash: string; resource_id: string; feedback_id: string | null;
      owner_id: string | null; state: string | null; deleted_at: number | null;
    }>();
  if (!prior) return null;
  if (prior.request_hash !== hash || prior.feedback_id !== feedbackId || prior.owner_id !== actor.id ||
      prior.deleted_at !== null || prior.state === "deleted" || !prior.state) {
    throw new HttpError(409, "idempotency_conflict", "Use a new submission key for a different picture.");
  }
  return jsonResponse({ media: { id: prior.resource_id, status: prior.state }, duplicate: true }, 200);
}

/** Root must authenticate, validate CSRF and require the exact browser Origin first. */
export async function uploadFeedbackPicture(
  request: Request, db: Database, env: BackendEnv, actor: Actor, feedbackId: string,
): Promise<Response> {
  const key = request.headers.get("Idempotency-Key") ?? "";
  if (!ID_KEY.test(key)) throw new HttpError(400, "idempotency_required", "Please refresh the upload and try again.");
  const contentType = request.headers.get("Content-Type")?.trim().toLowerCase() ?? "";
  if (!["image/png", "image/jpeg", "image/webp"].includes(contentType)) {
    throw new HttpError(415, "picture_format", "Choose a PNG, JPEG, or WebP picture.");
  }
  const length = request.headers.get("Content-Length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_PICTURE_BYTES)) {
    throw new HttpError(413, "picture_too_large", "Choose a picture smaller than 5 MiB.");
  }
  const admissionAt = Date.now();
  if (!await currentFeedback(db, actor, feedbackId, admissionAt)) {
    throw new HttpError(404, "not_available", "This report is not available.");
  }
  await reserveUploadAttempt(db, actor, admissionAt);
  const bytes = await readBoundedBytes(request.body, MAX_PICTURE_BYTES,
    AbortSignal.any([request.signal, AbortSignal.timeout(60_000)]));
  if (!validPictureSignature(bytes, contentType)) {
    throw new HttpError(415, "picture_format", "This file does not match a supported picture format.");
  }
  // Magic bytes only establish an intake format. Full decoding, normalization and
  // malware/content screening are still required; no original is made readable.
  const sha256 = await hexHash(bytes);
  const requestHash = await hexHash(new TextEncoder().encode(JSON.stringify({
    action: "feedback_picture", feedbackId, contentType, sha256,
  })));
  const prior = await priorUpload(db, actor, key, requestHash, feedbackId, Date.now());
  if (prior) return prior;
  if (!await currentFeedback(db, actor, feedbackId, Date.now())) {
    throw new HttpError(404, "not_available", "This report is not available.");
  }
  const mediaId = crypto.randomUUID();
  const storageKey = `quarantine/${crypto.randomUUID()}/${mediaId}`;
  const jobId = crypto.randomUUID();
  try {
    await env.MEDIA.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" },
      customMetadata: { mediaId, createdAt: String(Date.now()), purpose: "feedback-quarantine" },
    });
  } catch {
    // No database write has begun, so removing an ambiguously written object is safe.
    await env.MEDIA.delete(storageKey).catch(() => undefined);
    throw new HttpError(503, "upload_unavailable", "The picture could not be saved. Please try again.", true);
  }
  let committed = false;
  try {
    const at = Date.now();
    const results = await db.batch([
      db.prepare(`INSERT INTO media
        (id,owner_id,feedback_id,storage_key,content_type,byte_size,sha256,state,created_at,updated_at)
        SELECT ?, ?, ?, ?, ?, ?, ?, 'quarantined', ?, ?
        WHERE ${feedbackGuard()} AND ${sessionGuard()}
          AND NOT EXISTS (SELECT 1 FROM idempotency WHERE owner_id = ? AND key = ?)
          AND (SELECT COUNT(*) FROM media WHERE feedback_id = ? AND state != 'deleted' AND deleted_at IS NULL) < ?
      `).bind(mediaId, actor.id, feedbackId, storageKey, contentType, bytes.byteLength, sha256, at, at,
        feedbackId, actor.id, ...sessionValues(actor, at), actor.id, key, feedbackId, MAX_PICTURES),
      db.prepare(`INSERT INTO idempotency(owner_id,key,request_hash,resource_id,created_at)
        SELECT ?, ?, ?, media.id, ? FROM media WHERE media.id = ? AND media.owner_id = ?
          AND media.feedback_id = ? AND ${feedbackGuard()} AND ${sessionGuard()}
      `).bind(actor.id, key, requestHash, at, mediaId, actor.id, feedbackId,
        feedbackId, actor.id, ...sessionValues(actor, at)),
      db.prepare(`INSERT INTO jobs
        (id,kind,resource_id,recipient_id,state,next_attempt_at,next_dispatch_at,created_at,updated_at)
        SELECT ?, 'media_screen', media.id, media.owner_id, 'pending', ?, ?, ?, ? FROM media
        WHERE media.id = ? AND media.owner_id = ? AND media.feedback_id = ?
          AND EXISTS (SELECT 1 FROM idempotency WHERE owner_id = ? AND key = ? AND resource_id = media.id)
          AND ${feedbackGuard()} AND ${sessionGuard()}
      `).bind(jobId, at, at, at, at, mediaId, actor.id, feedbackId, actor.id, key,
        feedbackId, actor.id, ...sessionValues(actor, at)),
    ]);
    committed = results[0].meta.changes === 1;
    if (!committed) {
      await env.MEDIA.delete(storageKey);
      const duplicate = await priorUpload(db, actor, key, requestHash, feedbackId, Date.now());
      if (duplicate) return duplicate;
      if (!await currentFeedback(db, actor, feedbackId, Date.now())) {
        throw new HttpError(404, "not_available", "This report is not available.");
      }
      throw new HttpError(409, "picture_limit", "You can attach up to three pictures to a report.");
    }
    return jsonResponse({ media: { id: mediaId, status: "quarantined" }, duplicate: false }, 202);
  } catch (error) {
    if (!committed) {
      // D1 may have committed before an ambiguous transport failure. Never delete
      // a referenced file; retain an uncertain private object for reconciliation.
      try {
        const reference = await db.prepare("SELECT id FROM media WHERE id = ? AND storage_key = ?")
          .bind(mediaId, storageKey).first<{ id: string }>();
        if (!reference) await env.MEDIA.delete(storageKey);
      } catch { /* A private orphan is safer than deleting a possibly committed upload. */ }
    }
    throw error;
  }
}
