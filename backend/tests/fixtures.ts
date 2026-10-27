import { env } from "cloudflare:workers";
import { hashSecret } from "../src/data";

export const NOW = Date.now();
export const ORIGIN = "http://localhost:8787";
export const USERS = ["author", "recipient", "member", "newmember", "pending", "removed", "outsider", "owner"] as const;

export async function resetDatabase() {
  const tables = ["notifications", "review_cases", "jobs", "media", "acknowledgments", "replies", "posts", "deliveries", "authored_sources", "idempotency", "feedback", "rate_buckets", "box_blocks", "blocks", "box_circle", "friendships", "memberships", "sessions", "boxes", "users"];
  await env.DB.batch(tables.map(table => env.DB.prepare(`DELETE FROM ${table}`)));
  const objects = await env.MEDIA.list();
  if (objects.objects.length) await env.MEDIA.delete(objects.objects.map(object => object.key));
}

export async function seedUsers() {
  await env.DB.batch(USERS.map(id => env.DB.prepare("INSERT INTO users(id,username,display_name,visibility,created_at) VALUES(?,?,?,'everyone',?)").bind(id, `${id}-handle`, `${id} fixture`, NOW - 10000)));
  await env.DB.batch([
    env.DB.prepare("INSERT INTO boxes(id,kind,owner_id,slug,display_name,visibility,created_at) VALUES('personal-box','personal','recipient','recipient-box','Personal Box','everyone',?)").bind(NOW - 10000),
    env.DB.prepare("INSERT INTO boxes(id,kind,owner_id,slug,display_name,visibility,authority_verified_at,created_at) VALUES('church-box','organization','owner','church-box','Church Box','everyone',?,?)").bind(NOW - 10000, NOW - 10000),
  ]);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO memberships(box_id,user_id,status,role,approved_by,approved_at) VALUES('church-box','owner','approved','owner','owner',?)").bind(NOW - 10000),
    env.DB.prepare("INSERT INTO memberships(box_id,user_id,status,approved_by,approved_at) VALUES('church-box','member','approved','owner',?)").bind(NOW - 10000),
    env.DB.prepare("INSERT INTO memberships(box_id,user_id,status,approved_by,approved_at) VALUES('church-box','newmember','approved','owner',?)").bind(NOW - 1000),
    env.DB.prepare("INSERT INTO memberships(box_id,user_id,status) VALUES('church-box','pending','pending')"),
    env.DB.prepare("INSERT INTO memberships(box_id,user_id,status,approved_by,approved_at,revoked_at) VALUES('church-box','removed','revoked','owner',?,?)").bind(NOW - 10000, NOW - 2000),
  ]);
}

export async function session(user: typeof USERS[number], overrides: { expiresAt?: number; revokedAt?: number; epoch?: number } = {}) {
  const token = `synthetic-session-${user}-${crypto.randomUUID()}`;
  const csrf = await hashSecret(`csrf:${token}`);
  await env.DB.prepare("INSERT INTO sessions(id,token_hash,csrf_hash,user_id,session_epoch,authenticated_at,expires_at,revoked_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), await hashSecret(token), await hashSecret(csrf), user, overrides.epoch ?? 0, NOW - 1000, overrides.expiresAt ?? NOW + 3600000, overrides.revokedAt ?? null, NOW - 1000).run();
  return { token, csrf, headers: { Cookie: `pb_session=${token}`, "X-CSRF-Token": csrf, Origin: ORIGIN } };
}

export async function seedDelivery(options: { id?: string; organization?: boolean; audience?: string; anonymous?: boolean; history?: "at_delivery" | "retained"; approved?: boolean } = {}) {
  const id = options.id ?? "delivery-a";
  const source = `source-${id}`;
  await env.DB.prepare("INSERT INTO authored_sources(id,author_id,created_at) VALUES(?,'author',?)").bind(source, NOW - 5000).run();
  await env.DB.prepare(`INSERT INTO deliveries(id,source_id,box_id,audience,author_ceiling,box_ceiling,anonymous,status,history_policy,history_notice_version,group_block_policy,created_at)
    VALUES(?,?,?,?,'everyone','everyone',?,?,?,?,?,?)`).bind(id, source, options.organization ? "church-box" : "personal-box", options.audience ?? "private", options.anonymous === false ? 0 : 1,
      options.approved === false ? "pending" : "approved", options.organization ? options.history ?? "at_delivery" : "personal", options.organization ? "fixture-notice-v1" : null,
      options.organization ? "hold_on_conflict" : null, NOW - 5000).run();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO posts(id,delivery_id,kind,title,body,status,created_at) VALUES(?,?,'request','Original title','Synthetic original prayer','approved',?)").bind(`post-${id}`, id, NOW - 5000),
    env.DB.prepare("INSERT INTO posts(id,delivery_id,kind,title,body,status,created_at) VALUES(?,?,'update','Original title','Synthetic later update','approved',?)").bind(`update-${id}`, id, NOW - 2000),
  ]);
  return { id, source, postId: `post-${id}`, updateId: `update-${id}` };
}
