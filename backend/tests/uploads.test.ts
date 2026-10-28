import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/index";
import { NOW, ORIGIN, resetDatabase, seedUsers, session } from "./fixtures";

// Synthetic intake bytes deliberately receive no decoding/approval claim.
const PNG_INTAKE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
beforeEach(async () => {
  await resetDatabase(); await seedUsers();
  await env.DB.prepare("INSERT INTO feedback(id,owner_id,category,body,status,created_at,updated_at) VALUES('feedback-a','author','bug','Synthetic report','received',?,?)").bind(NOW, NOW).run();
});

async function upload(auth: Awaited<ReturnType<typeof session>>, key: string, body = PNG_INTAKE, contentType = "image/png") {
  return handleRequest(new Request(`${ORIGIN}/api/feedback/feedback-a/pictures`, { method: "POST", headers: { ...auth.headers, "Idempotency-Key": key, "Content-Type": contentType }, body }), env);
}

describe("private feedback upload intake", () => {
  it("stores a quarantined object plus durable work, with no key or raw bytes in the response", async () => {
    const auth = await session("author");
    const response = await upload(auth, "picture-one");
    expect(response.status).toBe(202);
    const receipt = await response.json() as { media: { id: string; status: string } };
    expect(receipt.media.status).toBe("quarantined");
    expect(JSON.stringify(receipt)).not.toContain("quarantine/");
    expect(await env.DB.prepare("SELECT state,normalized_key FROM media").first()).toEqual({ state: "quarantined", normalized_key: null });
    expect(await env.DB.prepare("SELECT kind,state FROM jobs").first()).toEqual({ kind: "media_screen", state: "pending" });
    const objects = await env.MEDIA.list();
    expect(objects.objects).toHaveLength(1);
    expect(objects.objects[0].key).toMatch(/^quarantine\//);
    const read = await handleRequest(new Request(`${ORIGIN}/media/${receipt.media.id}`, { headers: auth.headers }), env);
    expect(read.status).toBe(404);
  });

  it("rejects wrong ownership, missing CSRF, unsupported MIME and mismatched signatures", async () => {
    expect((await upload(await session("outsider"), "wrong-owner")).status).toBe(404);
    const auth = await session("author");
    expect((await upload({ ...auth, headers: { ...auth.headers, "X-CSRF-Token": "" } }, "missing-csrf")).status).toBe(403);
    expect((await upload(auth, "bad-mime-type", PNG_INTAKE, "image/svg+xml")).status).toBe(415);
    expect((await upload(auth, "bad-signature", new Uint8Array([1, 2, 3]))).status).toBe(415);
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
  });

  it("bounds actual upload bytes before R2 writes", async () => {
    const bytes = new Uint8Array(5 * 1024 * 1024 + 1);
    bytes.set(PNG_INTAKE);
    expect((await upload(await session("author"), "too-large-image", bytes)).status).toBe(413);
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
  });

  it("deduplicates an upload retry and rejects reusing its key for changed bytes", async () => {
    const auth = await session("author");
    const first = await (await upload(auth, "repeat-image")).json() as { media: { id: string } };
    const replay = await upload(auth, "repeat-image");
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ media: { id: first.media.id }, duplicate: true });
    expect((await upload(auth, "repeat-image", new Uint8Array([...PNG_INTAKE, 1]))).status).toBe(409);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM media").first("count")).toBe(1);
    expect((await env.MEDIA.list()).objects).toHaveLength(1);
  });

  it("enforces the three-picture cap under concurrent uploads and removes unused private objects", async () => {
    const auth = await session("author");
    const responses = await Promise.all(Array.from({ length: 4 }, (_, index) => upload(auth, `concurrent-${index}`)));
    expect(responses.map(response => response.status).sort()).toEqual([202, 202, 202, 409]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM media").first("count")).toBe(3);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM jobs").first("count")).toBe(3);
    expect((await env.MEDIA.list()).objects).toHaveLength(3);
  });

  it("does not commit an upload when the session is revoked during R2 storage", async () => {
    const auth = await session("author");
    const originalPut = env.MEDIA.put.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, "put").mockImplementationOnce(async (key, value, options) => {
      const stored = await originalPut(key, value, options);
      await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE user_id='author'").bind(Date.now()).run();
      return stored;
    });
    expect((await upload(auth, "revoked-during-put")).status).toBe(404);
    for (const table of ["media", "jobs", "idempotency"]) expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first("count")).toBe(0);
    expect((await env.MEDIA.list()).objects).toHaveLength(0);
  });

  it("keeps all database state absent on R2 failure", async () => {
    vi.spyOn(env.MEDIA, "put").mockRejectedValueOnce(new Error("synthetic storage outage"));
    expect((await upload(await session("author"), "storage-failure")).status).toBe(503);
    for (const table of ["media", "jobs", "idempotency"]) expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first("count")).toBe(0);
  });
});
