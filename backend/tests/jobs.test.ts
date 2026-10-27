import { env } from "cloudflare:workers";
import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeDeadLetterBatch, consumeJobBatch, dispatchOutbox } from "../src/jobs";
import { NOW, resetDatabase, seedUsers } from "./fixtures";

beforeEach(async () => { await resetDatabase(); await seedUsers(); });

async function seedFeedback() {
  await env.DB.prepare("INSERT INTO feedback(id,owner_id,category,body,status,created_at,updated_at) VALUES('feedback-a','author','bug','Synthetic feedback','received',?,?)").bind(NOW, NOW).run();
  await seedJob("triage-a", "feedback_triage", "feedback-a");
}

async function seedJob(id: string, kind: string, resource: string, recipient: string | null = null) {
  await env.DB.prepare("INSERT INTO jobs(id,kind,resource_id,recipient_id,state,next_attempt_at,next_dispatch_at,created_at,updated_at) VALUES(?,?,?,?,'pending',?,?,?,?)").bind(id, kind, resource, recipient, NOW, NOW, NOW, NOW).run();
}

async function consume(ids: string[], options: { deadLetter?: boolean; now?: number } = {}) {
  const batch = createMessageBatch("prayer-box-jobs-local", ids.map((jobId, index) => ({ id: `transport-${index}`, timestamp: new Date(NOW), attempts: 1, body: { jobId } })));
  const context = createExecutionContext();
  await (options.deadLetter ? consumeDeadLetterBatch : consumeJobBatch)(batch, env.DB, { now: () => options.now ?? NOW + 100 });
  return getQueueResult(batch, context);
}

describe("durable queue effects in real D1", () => {
  it("delivers an opaque job through the actual local Queue binding and Worker consumer", async () => {
    await seedFeedback();
    await env.JOBS.send({ jobId: "triage-a" });
    await expect.poll(async () => env.DB.prepare("SELECT state FROM jobs WHERE id='triage-a'").first("state"), { timeout: 8000, interval: 100 }).toBe("completed");
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM review_cases WHERE subject_id='feedback-a'").first("count")).toBe(1);
  });

  it("deduplicates triage and notification effects across duplicate/reordered transport", async () => {
    await seedFeedback();
    await consume(["notice:triage-a"]); // Reordered, not created yet: later outbox publication remains durable.
    await consume(["triage-a", "triage-a"]);
    await consume(["notice:triage-a", "notice:triage-a", "triage-a"]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM review_cases WHERE subject_id='feedback-a'").first("count")).toBe(1);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE resource_id='feedback-a'").first("count")).toBe(1);
    expect(await env.DB.prepare("SELECT state,attempts FROM jobs WHERE id='triage-a'").first()).toMatchObject({ state: "completed", attempts: 1 });
    expect(await env.DB.prepare("SELECT status FROM feedback WHERE id='feedback-a'").first("status")).toBe("needs_manual_review");
  });

  it("keeps durable work pending when transport fails, then sends only its opaque ID", async () => {
    await seedFeedback();
    const send = vi.spyOn(env.JOBS, "send").mockRejectedValueOnce(new Error("synthetic outage"));
    expect(await dispatchOutbox(env.DB, env.JOBS, { now: () => NOW + 100 })).toEqual({ sent: 0, failed: 1 });
    expect(await env.DB.prepare("SELECT state,error_code,dispatch_token FROM jobs WHERE id='triage-a'").first()).toMatchObject({ state: "pending", error_code: "transport_unavailable", dispatch_token: null });
    send.mockResolvedValueOnce({ metadata: { metrics: { backlogCount: 1, backlogBytes: 1 } } });
    expect(await dispatchOutbox(env.DB, env.JOBS, { now: () => NOW + 60101 })).toEqual({ sent: 1, failed: 0 });
    expect(send.mock.calls[1]).toEqual([{ jobId: "triage-a" }, { contentType: "json" }]);
  });

  it("never releases media when no scanner is connected and deduplicates manual cases", async () => {
    await seedFeedback();
    await env.DB.prepare("INSERT INTO media(id,owner_id,feedback_id,storage_key,content_type,byte_size,sha256,state,created_at,updated_at) VALUES('media-a','author','feedback-a','quarantine/synthetic','image/png',4,?,'quarantined',?,?)").bind("a".repeat(64), NOW, NOW).run();
    await env.MEDIA.put("quarantine/synthetic", new Uint8Array([1, 2, 3, 4]));
    await seedJob("scan-a", "media_screen", "media-a");
    await consume(["scan-a", "scan-a"]);
    expect(await env.DB.prepare("SELECT state,normalized_key FROM media WHERE id='media-a'").first()).toEqual({ state: "needs_manual_review", normalized_key: null });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM review_cases WHERE subject_id='media-a'").first("count")).toBe(1);
    expect(await env.DB.prepare("SELECT state FROM jobs WHERE id='scan-a'").first("state")).toBe("needs_manual_review");
  });

  it("suppresses delayed notifications after owner restriction or feedback deletion", async () => {
    await seedFeedback();
    await consume(["triage-a"]);
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id='author'").run();
    await consume(["notice:triage-a"]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications").first("count")).toBe(0);
    await env.DB.prepare("UPDATE users SET status='active' WHERE id='author'").run();
    await seedJob("late-notice", "notification", "feedback-a", "author");
    await env.DB.prepare("UPDATE feedback SET status='deleted',deleted_at=? WHERE id='feedback-a'").bind(NOW).run();
    await consume(["late-notice"]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications").first("count")).toBe(0);
  });

  it("does not let stale dead letters override completed work or current processing leases", async () => {
    await seedFeedback();
    await consume(["triage-a"]);
    await consume(["triage-a"], { deadLetter: true });
    expect(await env.DB.prepare("SELECT state FROM jobs WHERE id='triage-a'").first("state")).toBe("completed");
    await env.DB.prepare("UPDATE jobs SET state='processing',lease_token='current',lease_until=? WHERE id='notice:triage-a'").bind(NOW + 60000).run();
    const result = await consume(["notice:triage-a"], { deadLetter: true });
    expect(result.retryMessages).toHaveLength(1);
    expect(await env.DB.prepare("SELECT state,lease_token FROM jobs WHERE id='notice:triage-a'").first()).toEqual({ state: "processing", lease_token: "current" });
  });

  it("reschedules a stale transport dead letter without exhausting the durable processing budget", async () => {
    await seedFeedback();
    await consume(["triage-a"], { deadLetter: true });
    expect(await env.DB.prepare("SELECT state,attempts,error_code FROM jobs WHERE id='triage-a'").first()).toEqual({ state: "pending", attempts: 0, error_code: "transport_dead_letter" });
    await consume(["triage-a"]);
    expect(await env.DB.prepare("SELECT state,attempts FROM jobs WHERE id='triage-a'").first()).toEqual({ state: "completed", attempts: 1 });
  });

  it("does not let an expired processing lease execute an unguarded durable effect", async () => {
    await seedFeedback();
    let calls = 0;
    const batch = createMessageBatch("prayer-box-jobs-local", [{ id: "expired", timestamp: new Date(NOW), attempts: 1, body: { jobId: "triage-a" } }]);
    await consumeJobBatch(batch, env.DB, { now: () => calls++ === 0 ? NOW + 100 : NOW + 70000 });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM review_cases").first("count")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM notifications").first("count")).toBe(0);
    expect(await env.DB.prepare("SELECT status FROM feedback WHERE id='feedback-a'").first("status")).toBe("received");
  });

  it("records a durable manual failure after the bounded processing attempts", async () => {
    await seedFeedback();
    await env.DB.prepare("UPDATE jobs SET attempts=5 WHERE id='triage-a'").run();
    await consume(["triage-a"]);
    expect(await env.DB.prepare("SELECT state,error_code FROM jobs WHERE id='triage-a'").first()).toEqual({ state: "dead_letter", error_code: "attempts_exhausted" });
    expect(await env.DB.prepare("SELECT reason_code FROM review_cases WHERE subject_id='triage-a'").first("reason_code")).toBe("attempts_exhausted");
  });
});
