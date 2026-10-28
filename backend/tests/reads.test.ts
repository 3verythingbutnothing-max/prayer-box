import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadActor, primary } from "../src/data";
import { handleRead } from "../src/reads";
import { NOW, ORIGIN, resetDatabase, seedDelivery, seedUsers, session } from "./fixtures";

beforeEach(async () => { await resetDatabase(); await seedUsers(); });

async function read(path: string, user?: Parameters<typeof session>[0], headers?: HeadersInit) {
  const actor = user ? await loadActor(primary(env.DB), (await session(user)).token) : null;
  return handleRead(new Request(`${ORIGIN}${path}`, { headers }), primary(env.DB), env, actor);
}

describe("authorized API reads and private R2 gateway", () => {
  it("returns the same generic denial for missing, pending and unauthorized deliveries", async () => {
    await seedDelivery();
    await seedDelivery({ id: "pending-delivery", approved: false });
    for (const id of ["delivery-a", "missing-delivery", "pending-delivery"]) {
      await expect(read(`/api/deliveries/${id}`, "outsider")).rejects.toMatchObject({ status: 404, code: "not_found", message: "This item is not available." });
    }
  });

  it("cannot use a foreign post ID to enumerate another delivery's replies", async () => {
    const a = await seedDelivery();
    const b = await seedDelivery({ id: "delivery-b", organization: true });
    await expect(read(`/api/deliveries/${a.id}/posts/${b.postId}/replies`, "recipient")).rejects.toMatchObject({ status: 404 });
  });

  it("keeps quarantined original bytes inaccessible even to their uploader", async () => {
    await env.DB.prepare("INSERT INTO feedback(id,owner_id,category,body,status,created_at,updated_at) VALUES('feedback-a','author','bug','Synthetic feedback','received',?,?)").bind(NOW, NOW).run();
    await env.MEDIA.put("quarantine/original", new Uint8Array([1, 2, 3, 4]));
    await env.DB.prepare("INSERT INTO media(id,owner_id,feedback_id,storage_key,content_type,byte_size,sha256,state,created_at,updated_at) VALUES('quarantined','author','feedback-a','quarantine/original','image/png',4,?,'quarantined',?,?)").bind("a".repeat(64), NOW, NOW).run();
    for (const user of ["author", "recipient", undefined] as const) {
      await expect(read("/media/quarantined", user)).rejects.toMatchObject({ status: 404 });
    }
    const feedback = await read("/api/feedback/feedback-a", "author");
    const serialized = await feedback!.text();
    expect(serialized).toContain('"status":"quarantined"');
    expect(serialized).not.toContain("quarantine/original");
  });

  it("serves only an approved normalized derivative and rechecks access on every Range request", async () => {
    const delivery = await seedDelivery({ organization: true });
    await env.MEDIA.put("quarantine/original", new Uint8Array([9, 9, 9, 9]));
    await env.MEDIA.put("normalized/safe", new Uint8Array([1, 2, 3, 4]));
    await env.DB.prepare("INSERT INTO media(id,owner_id,delivery_id,post_id,revision,storage_key,normalized_key,content_type,byte_size,sha256,state,created_at,updated_at) VALUES('approved-image','author',?,?,1,'quarantine/original','normalized/safe','image/png',4,?,'approved',?,?)").bind(delivery.id, delivery.postId, "a".repeat(64), NOW, NOW).run();
    const allowed = (await read("/media/approved-image", "member", { Range: "bytes=0-1" }))!;
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Accept-Ranges")).toBe("none");
    expect(allowed.headers.get("Cache-Control")).toBe("private, no-store");
    expect(Array.from(new Uint8Array(await allowed.arrayBuffer()))).toEqual([1, 2, 3, 4]);
    await expect(read("/media/approved-image", "outsider")).rejects.toMatchObject({ status: 404 });
    await env.DB.prepare("UPDATE memberships SET status='revoked',revoked_at=? WHERE box_id='church-box' AND user_id='member'").bind(NOW).run();
    await expect(read("/media/approved-image", "member", { Range: "bytes=0-1" })).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a derivative from an old post revision or one pointing at original storage", async () => {
    const delivery = await seedDelivery();
    await env.MEDIA.put("normalized/safe", new Uint8Array([1, 2, 3, 4]));
    await env.DB.prepare("INSERT INTO media(id,owner_id,delivery_id,post_id,revision,storage_key,normalized_key,content_type,byte_size,sha256,state,created_at,updated_at) VALUES('old-image','author',?,?,1,'quarantine/original','normalized/safe','image/png',4,?,'approved',?,?)").bind(delivery.id, delivery.postId, "a".repeat(64), NOW, NOW).run();
    await env.DB.prepare("UPDATE posts SET revision=2 WHERE id=?").bind(delivery.postId).run();
    await expect(read("/media/old-image", "recipient")).rejects.toMatchObject({ status: 404 });
    await env.DB.prepare("UPDATE media SET revision=2,normalized_key=storage_key WHERE id='old-image'").run();
    await expect(read("/media/old-image", "recipient")).rejects.toMatchObject({ status: 404 });
  });

  it.each(["session", "membership", "approval"])("does not release bytes if %s is revoked during R2 retrieval", async (kind) => {
    const delivery = await seedDelivery({ organization: true });
    await env.MEDIA.put("normalized/barrier", new Uint8Array([1, 2, 3, 4]));
    await env.DB.prepare("INSERT INTO media(id,owner_id,delivery_id,post_id,revision,storage_key,normalized_key,content_type,byte_size,sha256,state,created_at,updated_at) VALUES('barrier-image','author',?,?,1,'quarantine/original','normalized/barrier','image/png',4,?,'approved',?,?)").bind(delivery.id, delivery.postId, "a".repeat(64), NOW, NOW).run();
    const originalGet = env.MEDIA.get.bind(env.MEDIA);
    vi.spyOn(env.MEDIA, "get").mockImplementationOnce(async (key, options) => {
      const object = await originalGet(key, options);
      if (kind === "session") await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE user_id='member'").bind(Date.now()).run();
      else if (kind === "membership") await env.DB.prepare("UPDATE memberships SET status='revoked',revoked_at=? WHERE user_id='member' AND box_id='church-box'").bind(Date.now()).run();
      else await env.DB.prepare("UPDATE media SET state='rejected' WHERE id='barrier-image'").run();
      return object;
    });
    await expect(read("/media/barrier-image", "member", { Range: "bytes=0-1" })).rejects.toMatchObject({ status: 404 });
  });

  it("rechecks membership after the post query before returning a private story", async () => {
    await seedDelivery({ organization: true });
    const actor = await loadActor(primary(env.DB), (await session("member")).token);
    const db = primary(env.DB);
    const originalPrepare = db.prepare.bind(db);
    vi.spyOn(db, "prepare").mockImplementation((query) => {
      const statement = originalPrepare(query);
      if (query.includes("FROM posts WHERE delivery_id")) {
        const originalBind = statement.bind.bind(statement);
        vi.spyOn(statement, "bind").mockImplementation((...values) => {
          const bound = originalBind(...values);
          const originalAll = bound.all.bind(bound);
          vi.spyOn(bound, "all").mockImplementationOnce(async <T>() => {
            const result = await originalAll<T>();
            await env.DB.prepare("UPDATE memberships SET status='revoked',revoked_at=? WHERE user_id='member' AND box_id='church-box'").bind(Date.now()).run();
            return result;
          });
          return bound;
        });
      }
      return statement;
    });
    await expect(handleRead(new Request(`${ORIGIN}/api/deliveries/delivery-a`), db, env, actor)).rejects.toMatchObject({ status: 404 });
  });
});
