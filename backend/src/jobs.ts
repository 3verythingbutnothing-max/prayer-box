/** Queue transport contains identifiers only; private content stays in D1/R2. */
export interface JobMessage { jobId: string }

interface JobRow {
  id: string;
  kind: "feedback_triage" | "notification" | "media_screen";
  resource_id: string;
  recipient_id: string | null;
  state: "pending" | "processing" | "completed" | "needs_manual_review" | "dead_letter" | "cancelled";
  attempts: number;
  lease_until: number | null;
  next_attempt_at: number;
}

interface JobOptions { now?: () => number }
const MAX_ATTEMPTS = 5;
const PROCESSING_LEASE_MS = 60_000;
const DISPATCH_LEASE_MS = 30_000;
const REDISPATCH_MS = 60_000;
const terminal = new Set(["completed", "needs_manual_review", "dead_letter", "cancelled"]);

function messageId(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.jobId !== "string" ||
      !/^[A-Za-z0-9_:-]{1,160}$/.test(record.jobId)) return null;
  return record.jobId;
}

/** Durable rows are inserted in the same D1 transaction as the originating change. */
export async function dispatchOutbox(
  db: D1Database,
  queue: Queue<JobMessage>,
  options: JobOptions & { limit?: number } = {},
): Promise<{ sent: number; failed: number }> {
  const now = options.now ?? Date.now;
  const limit = options.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid dispatch limit");
  const selectedAt = now();
  const rows = await db.prepare(`
    SELECT id FROM jobs
    WHERE (state = 'pending' OR (state = 'processing' AND lease_until <= ?))
      AND next_attempt_at <= ? AND next_dispatch_at <= ?
      AND (dispatch_until IS NULL OR dispatch_until <= ?)
    ORDER BY next_dispatch_at, id LIMIT ?
  `).bind(selectedAt, selectedAt, selectedAt, selectedAt, limit).all<{ id: string }>();
  let sent = 0;
  let failed = 0;
  for (const row of rows.results) {
    const at = now();
    const dispatchToken = crypto.randomUUID();
    const claim = await db.prepare(`
      UPDATE jobs SET dispatch_token = ?, dispatch_until = ?, updated_at = ?
      WHERE id = ? AND next_attempt_at <= ? AND next_dispatch_at <= ?
        AND (state = 'pending' OR (state = 'processing' AND lease_until <= ?))
        AND (dispatch_until IS NULL OR dispatch_until <= ?)
    `).bind(dispatchToken, at + DISPATCH_LEASE_MS, at, row.id, at, at, at, at).run();
    if (claim.meta.changes !== 1) continue;
    try {
      await queue.send({ jobId: row.id }, { contentType: "json" });
      sent++;
      // A consumer may already have completed; this never changes its state.
      await db.prepare(`
        UPDATE jobs SET dispatch_token = NULL, dispatch_until = NULL,
          next_dispatch_at = ?, updated_at = ?
        WHERE id = ? AND dispatch_token = ?
      `).bind(now() + REDISPATCH_MS, now(), row.id, dispatchToken).run();
    } catch {
      failed++;
      // Queue send can have succeeded before a network failure. Retrying the ID is safe.
      await db.prepare(`
        UPDATE jobs SET dispatch_token = NULL, dispatch_until = NULL,
          next_dispatch_at = ?, error_code = 'transport_unavailable', updated_at = ?
        WHERE id = ? AND dispatch_token = ? AND state IN ('pending','processing')
      `).bind(now() + REDISPATCH_MS, now(), row.id, dispatchToken).run();
    }
  }
  return { sent, failed };
}

function leaseGuard(): string {
  return "EXISTS (SELECT 1 FROM jobs j WHERE j.id = ? AND j.state = 'processing' AND j.lease_token = ? AND j.lease_until > ?)";
}

function finish(db: D1Database, job: JobRow, lease: string, at: number, state = "completed"): D1PreparedStatement {
  return db.prepare(`
    UPDATE jobs SET state = ?, lease_token = NULL, lease_until = NULL,
      dispatch_token = NULL, dispatch_until = NULL, error_code = NULL, updated_at = ?
    WHERE id = ? AND state = 'processing' AND lease_token = ? AND lease_until > ?
  `).bind(state, at, job.id, lease, at);
}

async function processJob(db: D1Database, job: JobRow, lease: string, at: number): Promise<void> {
  if (job.kind === "feedback_triage") {
    // Each effect has its own live lease/resource predicate: a zero-row guarded
    // UPDATE does not cause D1.batch() to roll back later statements.
    await db.batch([
      db.prepare(`UPDATE feedback SET status = 'needs_manual_review', updated_at = ?
        WHERE id = ? AND status = 'received' AND deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = feedback.owner_id AND u.status = 'active')
          AND ${leaseGuard()}`).bind(at, job.resource_id, job.id, lease, at),
      db.prepare(`INSERT INTO review_cases
        (id,kind,subject_id,state,reason_code,created_at,updated_at)
        SELECT ?, 'feedback_triage', f.id, 'needs_manual_review', 'new_feedback', ?, ?
        FROM feedback f JOIN users u ON u.id = f.owner_id
        WHERE f.id = ? AND f.deleted_at IS NULL AND f.status = 'needs_manual_review'
          AND u.status = 'active' AND ${leaseGuard()}
        ON CONFLICT(kind,subject_id) DO NOTHING
      `).bind(crypto.randomUUID(), at, at, job.resource_id, job.id, lease, at),
      db.prepare(`INSERT INTO jobs
        (id,kind,resource_id,recipient_id,state,next_attempt_at,next_dispatch_at,created_at,updated_at)
        SELECT ?, 'notification', f.id, f.owner_id, 'pending', ?, ?, ?, ?
        FROM feedback f JOIN users u ON u.id = f.owner_id
        WHERE f.id = ? AND f.deleted_at IS NULL AND f.status = 'needs_manual_review'
          AND u.status = 'active' AND ${leaseGuard()}
        ON CONFLICT(id) DO NOTHING
      `).bind(`notice:${job.id}`, at, at, at, at, job.resource_id, job.id, lease, at),
      finish(db, job, lease, at),
    ]);
    return;
  }
  if (job.kind === "notification") {
    await db.batch([
      db.prepare(`INSERT INTO notifications (id,recipient_id,kind,resource_id,created_at)
        SELECT ?, f.owner_id, 'feedback_received', f.id, ?
        FROM feedback f JOIN users u ON u.id = f.owner_id
        WHERE f.id = ? AND f.owner_id = ? AND f.deleted_at IS NULL AND f.status != 'deleted'
          AND u.status = 'active' AND ${leaseGuard()}
        ON CONFLICT(recipient_id,kind,resource_id) DO NOTHING
      `).bind(crypto.randomUUID(), at, job.resource_id, job.recipient_id, job.id, lease, at),
      finish(db, job, lease, at),
    ]);
    return;
  }
  if (job.kind === "media_screen") {
    // No qualified scanner/normalizer is connected. This handler can only hold a
    // feedback screenshot and open a manual case; it can never approve or serve it.
    const eligibleMedia = `SELECT 1 FROM feedback f JOIN users u ON u.id = f.owner_id
      WHERE f.id = media.feedback_id AND f.owner_id = media.owner_id
        AND f.deleted_at IS NULL AND f.status != 'deleted' AND u.status = 'active'`;
    await db.batch([
      db.prepare(`UPDATE media SET state = 'needs_manual_review', updated_at = ?
        WHERE id = ? AND state = 'quarantined' AND deleted_at IS NULL
          AND EXISTS (${eligibleMedia}) AND ${leaseGuard()}
      `).bind(at, job.resource_id, job.id, lease, at),
      db.prepare(`INSERT INTO review_cases
        (id,kind,subject_id,state,reason_code,created_at,updated_at)
        SELECT ?, 'media_review', media.id, 'needs_manual_review', 'scanner_unavailable', ?, ?
        FROM media WHERE id = ? AND state = 'needs_manual_review' AND deleted_at IS NULL
          AND EXISTS (${eligibleMedia}) AND ${leaseGuard()}
        ON CONFLICT(kind,subject_id) DO NOTHING
      `).bind(crypto.randomUUID(), at, at, job.resource_id, job.id, lease, at),
      db.prepare(`INSERT INTO notifications (id,recipient_id,kind,resource_id,created_at)
        SELECT ?, media.owner_id, 'media_review_needed', media.id, ?
        FROM media WHERE id = ? AND state = 'needs_manual_review' AND deleted_at IS NULL
          AND EXISTS (${eligibleMedia}) AND ${leaseGuard()}
        ON CONFLICT(recipient_id,kind,resource_id) DO NOTHING
      `).bind(crypto.randomUUID(), at, job.resource_id, job.id, lease, at),
      db.prepare(`UPDATE jobs SET state = CASE WHEN EXISTS
          (SELECT 1 FROM media WHERE id = ? AND state = 'needs_manual_review' AND deleted_at IS NULL
            AND EXISTS (${eligibleMedia}))
          THEN 'needs_manual_review' ELSE 'cancelled' END,
          lease_token = NULL, lease_until = NULL, dispatch_token = NULL, dispatch_until = NULL,
          error_code = 'scanner_unavailable', updated_at = ?
        WHERE id = ? AND state = 'processing' AND lease_token = ? AND lease_until > ?
      `).bind(job.resource_id, at, job.id, lease, at),
    ]);
    return;
  }
  throw new Error("Unsupported durable job kind");
}

async function markDeadLetter(db: D1Database, id: string, at: number, reason: string): Promise<void> {
  await db.batch([
    db.prepare(`UPDATE jobs SET state = 'dead_letter', error_code = ?,
      lease_token = NULL, lease_until = NULL, dispatch_token = NULL, dispatch_until = NULL, updated_at = ?
      WHERE id = ? AND (state = 'pending' OR (state = 'processing' AND lease_until <= ?))
    `).bind(reason, at, id, at),
    db.prepare(`INSERT INTO review_cases (id,kind,subject_id,state,reason_code,created_at,updated_at)
      SELECT ?, 'job_failure', id, 'needs_manual_review', ?, ?, ? FROM jobs
      WHERE id = ? AND state = 'dead_letter'
      ON CONFLICT(kind,subject_id) DO NOTHING
    `).bind(crypto.randomUUID(), reason, at, at, id),
  ]);
}

export async function consumeJobBatch(
  batch: MessageBatch<unknown>, db: D1Database, options: JobOptions = {},
): Promise<void> {
  const now = options.now ?? Date.now;
  for (const message of batch.messages) {
    const id = messageId(message.body);
    if (!id) { message.ack(); continue; }
    try {
      const at = now();
      let job = await db.prepare("SELECT * FROM jobs WHERE id = ?").bind(id).first<JobRow>();
      if (!job || terminal.has(job.state)) { message.ack(); continue; }
      if (job.state === "processing" && (job.lease_until ?? 0) > at) {
        message.retry({ delaySeconds: Math.max(1, Math.ceil(((job.lease_until ?? at) - at) / 1000)) });
        continue;
      }
      if (job.attempts >= MAX_ATTEMPTS) {
        await markDeadLetter(db, id, at, "attempts_exhausted");
        message.ack();
        continue;
      }
      if (job.next_attempt_at > at) {
        message.retry({ delaySeconds: Math.max(1, Math.min(43_200, Math.ceil((job.next_attempt_at - at) / 1000))) });
        continue;
      }
      const lease = crypto.randomUUID();
      job = await db.prepare(`UPDATE jobs SET state = 'processing', attempts = attempts + 1,
        lease_token = ?, lease_until = ?, updated_at = ?
        WHERE id = ? AND attempts < ? AND next_attempt_at <= ?
          AND (state = 'pending' OR (state = 'processing' AND lease_until <= ?))
        RETURNING *
      `).bind(lease, at + PROCESSING_LEASE_MS, at, id, MAX_ATTEMPTS, at, at).first<JobRow>();
      if (!job) { message.retry({ delaySeconds: 60 }); continue; }
      try {
        await processJob(db, job, lease, now());
        const final = await db.prepare("SELECT state FROM jobs WHERE id = ?").bind(id).first<{ state: string }>();
        if (final && terminal.has(final.state)) message.ack();
        else message.retry({ delaySeconds: 60 });
      } catch {
        const failedAt = now();
        const delayMs = Math.min(300_000, 5_000 * 2 ** (job.attempts - 1));
        await db.prepare(`UPDATE jobs SET state = 'pending', lease_token = NULL, lease_until = NULL,
          next_attempt_at = ?, next_dispatch_at = ?, error_code = 'processing_failed', updated_at = ?
          WHERE id = ? AND state = 'processing' AND lease_token = ?
        `).bind(failedAt + delayMs, failedAt + delayMs, failedAt, id, lease).run();
        if (job.attempts >= MAX_ATTEMPTS) {
          await markDeadLetter(db, id, failedAt, "attempts_exhausted");
          message.ack();
        } else message.retry({ delaySeconds: Math.ceil(delayMs / 1000) });
      }
    } catch {
      // Never acknowledge a known job when its durable failure state could not persist.
      message.retry({ delaySeconds: 60 });
    }
  }
}

/** A transport DLQ makes failure visible; it cannot override a completed/current lease. */
export async function consumeDeadLetterBatch(
  batch: MessageBatch<unknown>, db: D1Database, options: JobOptions = {},
): Promise<void> {
  const now = options.now ?? Date.now;
  for (const message of batch.messages) {
    const id = messageId(message.body);
    if (!id) { message.ack(); continue; }
    try {
      const at = now();
      const job = await db.prepare("SELECT state, lease_until, attempts FROM jobs WHERE id = ?").bind(id).first<JobRow>();
      if (job?.state === "processing" && (job.lease_until ?? 0) > at) {
        message.retry({ delaySeconds: 60 });
        continue;
      }
      if (job && !terminal.has(job.state)) {
        if (job.attempts >= MAX_ATTEMPTS) {
          await markDeadLetter(db, id, at, "attempts_exhausted");
        } else {
          // A delayed DLQ copy might belong to an older transport attempt. Only
          // D1's attempt count can exhaust work; record the incident and let the
          // outbox retry within the durable attempt budget.
          await db.batch([
            db.prepare(`UPDATE jobs SET error_code = 'transport_dead_letter', next_dispatch_at = ?, updated_at = ?
              WHERE id = ? AND attempts < ?
                AND (state = 'pending' OR (state = 'processing' AND lease_until <= ?))
            `).bind(at, at, id, MAX_ATTEMPTS, at),
            db.prepare(`INSERT INTO review_cases (id,kind,subject_id,state,reason_code,created_at,updated_at)
              SELECT ?, 'job_failure', id, 'needs_manual_review', 'transport_dead_letter', ?, ? FROM jobs
              WHERE id = ? AND state IN ('pending','processing') AND error_code = 'transport_dead_letter'
              ON CONFLICT(kind,subject_id) DO NOTHING
            `).bind(crypto.randomUUID(), at, at, id),
          ]);
        }
      }
      message.ack();
    } catch {
      message.retry({ delaySeconds: 60 });
    }
  }
}
