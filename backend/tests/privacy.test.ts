import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { loadActor, loadDeliveryContext, loadPosts, loadReplies, primary } from "../src/data";
import { toDeliveryDto, toPostDto, toReplyDto } from "../src/dto";
import { canReadDelivery } from "../src/policy";
import { NOW, resetDatabase, seedDelivery, seedUsers, session } from "./fixtures";

beforeEach(async () => { await resetDatabase(); await seedUsers(); });

async function actor(user: Parameters<typeof session>[0]) {
  return loadActor(primary(env.DB), (await session(user)).token);
}

describe("real D1 authentication and privacy boundary", () => {
  it("rejects missing, unknown, expired, revoked, epoch-invalid and suspended sessions", async () => {
    expect(await loadActor(primary(env.DB), null)).toBeNull();
    expect(await loadActor(primary(env.DB), "x".repeat(64))).toBeNull();
    expect(await loadActor(primary(env.DB), (await session("author", { expiresAt: NOW - 1 })).token)).toBeNull();
    expect(await loadActor(primary(env.DB), (await session("author", { revokedAt: NOW - 1 })).token)).toBeNull();
    expect(await loadActor(primary(env.DB), (await session("author", { epoch: 99 })).token)).toBeNull();
    const valid = await session("author");
    expect(await loadActor(primary(env.DB), valid.token)).toMatchObject({ id: "author" });
    await env.DB.prepare("UPDATE users SET status='suspended' WHERE id='author'").run();
    expect(await loadActor(primary(env.DB), valid.token)).toBeNull();
  });

  it("keeps personal deliveries separate from the recipient's church memberships", async () => {
    await seedDelivery();
    await env.DB.prepare("INSERT INTO memberships(box_id,user_id,status,approved_by,approved_at) VALUES('church-box','recipient','approved','owner',?)").bind(NOW - 10000).run();
    for (const user of ["author", "recipient", "member", "owner", "outsider"] as const) {
      const viewer = await actor(user);
      const context = await loadDeliveryContext(primary(env.DB), "delivery-a", viewer);
      expect(context).not.toBeNull();
      expect(canReadDelivery(context!, viewer)).toBe(["author", "recipient"].includes(user));
    }
    const context = await loadDeliveryContext(primary(env.DB), "delivery-a", null);
    expect(canReadDelivery(context!, null)).toBe(false);
  });

  it("admits only active approved members within the disclosed history policy and revokes on the next read", async () => {
    await seedDelivery({ organization: true });
    for (const user of ["member", "owner", "newmember", "pending", "removed", "outsider"] as const) {
      const viewer = await actor(user);
      expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", viewer))!, viewer)).toBe(["member", "owner"].includes(user));
    }
    const viewer = await actor("member");
    await env.DB.prepare("UPDATE memberships SET status='revoked',revoked_at=? WHERE box_id='church-box' AND user_id='member'").bind(NOW).run();
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", viewer))!, viewer)).toBe(false);
  });

  it("permits later-approved members only on explicit retained-history deliveries", async () => {
    await seedDelivery({ organization: true, history: "retained" });
    const viewer = await actor("newmember");
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", viewer))!, viewer)).toBe(true);
  });

  it("requires intersection of friendship circles and preserves restrictive ceiling snapshots", async () => {
    await seedDelivery({ audience: "friends" });
    await env.DB.prepare("UPDATE boxes SET visibility='friends' WHERE id='personal-box'").run();
    await env.DB.prepare("INSERT INTO friendships(user_a,user_b,status) VALUES('author','outsider','accepted')").run();
    const viewer = await actor("outsider");
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", viewer))!, viewer)).toBe(false);
    await env.DB.prepare("INSERT INTO friendships(user_a,user_b,status) VALUES('outsider','recipient','accepted')").run();
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", viewer))!, viewer)).toBe(true);
    await env.DB.prepare("UPDATE deliveries SET author_ceiling='private' WHERE id='delivery-a'").run();
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", viewer))!, viewer)).toBe(false);
  });

  it("holds a whole organization copy when its fixture block policy conflicts", async () => {
    await seedDelivery({ organization: true });
    await env.DB.prepare("INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES('author','member',?)").bind(NOW).run();
    const owner = await actor("owner");
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", owner))!, owner)).toBe(false);
  });

  it("revokes outsider access when a personal author and recipient block each other", async () => {
    await seedDelivery({ audience: "everyone" });
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", null))!, null)).toBe(true);
    await env.DB.prepare("INSERT INTO blocks(blocker_id,blocked_id,created_at) VALUES('recipient','author',?)").bind(NOW).run();
    expect(canReadDelivery((await loadDeliveryContext(primary(env.DB), "delivery-a", null))!, null)).toBe(false);
  });

  it("allowlists anonymous DTOs and exact update replies without leaking source, actor or sibling delivery", async () => {
    const first = await seedDelivery({ audience: "everyone" });
    const second = await seedDelivery({ id: "delivery-b", organization: true });
    await env.DB.batch([
      env.DB.prepare("INSERT INTO replies(id,delivery_id,post_id,actor_id,identity_mode,body,status,created_at) VALUES('reply-original',?,?,'recipient','personal','Original-only reply','approved',?)").bind(first.id, first.postId, NOW),
      env.DB.prepare("INSERT INTO replies(id,delivery_id,post_id,actor_id,identity_mode,body,status,created_at) VALUES('reply-update',?,?,'author','personal','Update-only reply','approved',?)").bind(first.id, first.updateId, NOW),
      env.DB.prepare("INSERT INTO acknowledgments(id,delivery_id,kind,template_version,body,created_at) VALUES('private-ack',?,'platform','v1','Poster-only secret receipt',?)").bind(first.id, NOW),
    ]);
    const viewer = await actor("recipient");
    const context = (await loadDeliveryContext(primary(env.DB), first.id, viewer))!;
    const posts = await loadPosts(primary(env.DB), context, viewer);
    const update = posts.find(post => post.id === first.updateId)!;
    const replies = await loadReplies(primary(env.DB), context, update, viewer);
    expect(replies.map(reply => reply.id)).toEqual(["reply-update"]);
    const dto = { ...toDeliveryDto(context, viewer), posts: posts.map(post => toPostDto(context, post, viewer)), replies: replies.map(reply => toReplyDto(context, update, reply, viewer)) };
    const serialized = JSON.stringify(dto);
    expect(dto.author).toEqual({ label: "Anonymous" });
    expect(dto.replies[0]?.byline).toEqual({ label: "Anonymous" });
    for (const secret of ["author-handle", "author fixture", first.source, second.id, "Poster-only secret receipt", "actor_id", "source_id", "agreedBy"]) expect(serialized).not.toContain(secret);
  });

  it("enforces exact delivery/post and reply-parent relationships at the database boundary", async () => {
    const a = await seedDelivery();
    const b = await seedDelivery({ id: "delivery-b" });
    await expect(env.DB.prepare("INSERT INTO replies(id,delivery_id,post_id,actor_id,identity_mode,body,status,created_at) VALUES('wrong-post',?,?,'recipient','personal','wrong scope','approved',?)").bind(a.id, b.postId, NOW).run()).rejects.toThrow();
    await env.DB.prepare("INSERT INTO replies(id,delivery_id,post_id,actor_id,identity_mode,body,status,created_at) VALUES('parent',?,?,'recipient','personal','parent','approved',?)").bind(a.id, a.postId, NOW).run();
    await expect(env.DB.prepare("INSERT INTO replies(id,delivery_id,post_id,parent_id,actor_id,identity_mode,body,status,created_at) VALUES('wrong-parent',?,?,'parent','recipient','personal','wrong parent','approved',?)").bind(a.id, a.updateId, NOW).run()).rejects.toThrow();
  });
});
