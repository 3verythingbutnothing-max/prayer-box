import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleRequest } from "../src/index";
import { NOW, ORIGIN, resetDatabase, seedDelivery, seedUsers, session } from "./fixtures";

beforeEach(async () => { await resetDatabase(); await seedUsers(); });
const backendEnv = () => ({ ...env, TURNSTILE_SECRET: "synthetic-secret", TURNSTILE_SITE_KEY: "synthetic-key" });
const verification = () => Response.json({ success: true, action: "feedback", hostname: "localhost" });

async function requestFeedback(auth: Awaited<ReturnType<typeof session>>, body: Record<string, unknown> = {}, key = "feedback-request-1", extraHeaders: Record<string, string> = {}) {
  const request = new Request(`${ORIGIN}/api/feedback`, {
    method: "POST", headers: { ...auth.headers, "Content-Type": "application/json", "Idempotency-Key": key, ...extraHeaders },
    body: JSON.stringify({ category: "bug", body: "A synthetic bug report", turnstileToken: "synthetic-token", ...body }),
  });
  return handleRequest(request, backendEnv(), { siteverifyFetch: async () => verification() });
}

describe("Worker API authorization and durable feedback", () => {
  it("does not accept forged frontend role/user headers as authentication", async () => {
    await seedDelivery();
    const headers = { "X-User-Id": "recipient", "X-Role": "admin", "X-Authenticated": "true" };
    const response = await handleRequest(new Request(`${ORIGIN}/api/deliveries/delivery-a`, { headers }), backendEnv());
    expect(response.status).toBe(404);
    const sessionResponse = await handleRequest(new Request(`${ORIGIN}/api/session`, { headers }), backendEnv());
    expect(await sessionResponse.json()).toMatchObject({ authenticated: false, actor: null, csrfToken: null });
  });

  it("rejects missing CSRF, cross-site origins and expired sessions before writing", async () => {
    const auth = await session("author");
    expect((await requestFeedback(auth, {}, "missing-csrf", { "X-CSRF-Token": "" })).status).toBe(403);
    expect((await requestFeedback(auth, {}, "bad-origin-1", { Origin: "https://attacker.invalid" })).status).toBe(403);
    const expired = await session("author", { expiresAt: NOW - 1 });
    expect((await requestFeedback(expired)).status).toBe(401);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback").first("count")).toBe(0);
  });

  it.each([{ category: "fundraising" }, { body: " " }, { body: "x".repeat(3001) }, { owner_id: "recipient" }, { status: "resolved" }, { role: "admin" }])("rejects malformed or authority-bearing fields", async (body) => {
    expect((await requestFeedback(await session("author"), body)).status).toBe(400);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback").first("count")).toBe(0);
  });

  it("commits feedback, idempotency and work together and deduplicates fresh-token retries", async () => {
    const auth = await session("author");
    const first = await requestFeedback(auth);
    expect(first.status).toBe(202);
    const receipt = await first.json();
    expect(await (await requestFeedback(auth, { turnstileToken: "replacement-token" })).json()).toEqual(receipt);
    expect((await requestFeedback(auth, { body: "Changed report" })).status).toBe(409);
    for (const table of ["feedback", "idempotency", "jobs"]) expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first("count")).toBe(1);
  });

  it("atomically collapses simultaneous duplicate submissions into one durable report", async () => {
    const auth = await session("author");
    const responses = await Promise.all([requestFeedback(auth, { turnstileToken: "first-token" }), requestFeedback(auth, { turnstileToken: "second-token" })]);
    expect(responses.map(response => response.status)).toEqual([202, 202]);
    expect(await responses[0].json()).toEqual(await responses[1].json());
    for (const table of ["feedback", "idempotency", "jobs"]) expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first("count")).toBe(1);
  });

  it("does not commit feedback after session revocation during bot verification", async () => {
    const auth = await session("author");
    const response = await handleRequest(new Request(`${ORIGIN}/api/feedback`, { method: "POST", headers: { ...auth.headers, "Content-Type": "application/json", "Idempotency-Key": "revoked-during-verify" }, body: JSON.stringify({ category: "bug", body: "A synthetic report", turnstileToken: "token" }) }), backendEnv(), {
      siteverifyFetch: async () => {
        await env.DB.prepare("UPDATE sessions SET revoked_at=? WHERE user_id='author'").bind(Date.now()).run();
        return verification();
      },
    });
    expect(response.status).toBe(401);
    for (const table of ["feedback", "idempotency", "jobs"]) expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first("count")).toBe(0);
  });

  it.each(["epoch", "csrf"])("rejects captured session %s rotation during verification", async (kind) => {
    const auth = await session("author");
    const response = await handleRequest(new Request(`${ORIGIN}/api/feedback`, { method: "POST", headers: { ...auth.headers, "Content-Type": "application/json", "Idempotency-Key": `rotated-session-${kind}` }, body: JSON.stringify({ category: "bug", body: "A synthetic report", turnstileToken: "token" }) }), backendEnv(), {
      siteverifyFetch: async () => {
        if (kind === "epoch") await env.DB.batch([
          env.DB.prepare("UPDATE users SET session_epoch=1 WHERE id='author'"),
          env.DB.prepare("UPDATE sessions SET session_epoch=1 WHERE user_id='author'"),
        ]);
        else await env.DB.prepare("UPDATE sessions SET csrf_hash=? WHERE user_id='author'").bind("f".repeat(64)).run();
        return verification();
      },
    });
    expect(response.status).toBe(401);
    for (const table of ["feedback", "idempotency", "jobs"]) expect(await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first("count")).toBe(0);
  });

  it("enforces the account write ceiling before repeated provider requests", async () => {
    const auth = await session("author");
    const statuses = [];
    for (let index = 0; index < 6; index++) statuses.push((await requestFeedback(auth, {}, `bounded-${index}`)).status);
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback").first("count")).toBe(5);
  });

  it("retains the exact five-write cap during a bounded twenty-request concurrent burst", async () => {
    const auth = await session("author");
    const responses = await Promise.all(Array.from({ length: 20 }, (_, index) => requestFeedback(auth, {}, `burst-report-${index}`)));
    expect(responses.filter(response => response.status === 202)).toHaveLength(5);
    expect(responses.filter(response => response.status === 429)).toHaveLength(15);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback").first("count")).toBe(5);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM jobs").first("count")).toBe(5);
  });

  it("requires a valid challenge and preserves pending state on a provider outage", async () => {
    const auth = await session("author");
    const response = await handleRequest(new Request(`${ORIGIN}/api/feedback`, { method: "POST", headers: { ...auth.headers, "Content-Type": "application/json", "Idempotency-Key": "provider-down" }, body: JSON.stringify({ category: "bug", body: "Synthetic report", turnstileToken: "token" }) }), backendEnv(), { siteverifyFetch: async () => { throw new Error("synthetic outage"); } });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("/#help");
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM feedback").first("count")).toBe(0);
  });

  it("requires current ownership for feedback and revokes logout sessions", async () => {
    const author = await session("author");
    const receipt = await (await requestFeedback(author)).json() as { id: string };
    const outsider = await session("outsider");
    const forbidden = await handleRequest(new Request(`${ORIGIN}/api/feedback/${receipt.id}`, { headers: outsider.headers }), backendEnv());
    expect(forbidden.status).toBe(404);
    const logout = await handleRequest(new Request(`${ORIGIN}/api/session/logout`, { method: "POST", headers: author.headers }), backendEnv());
    expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect((await requestFeedback(author, {}, "after-logout")).status).toBe(401);
  });

  it("keeps unsupported prayer submission routes closed, including self-box requests", async () => {
    const auth = await session("recipient");
    const response = await handleRequest(new Request(`${ORIGIN}/api/requests`, { method: "POST", headers: { ...auth.headers, "Content-Type": "application/json" }, body: JSON.stringify({ boxId: "personal-box", authorId: "author", status: "approved" }) }), backendEnv());
    expect(response.status).toBe(404);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM deliveries").first("count")).toBe(0);
  });

  it("keeps the local-only backend closed at public hostnames", async () => {
    const response = await handleRequest(new Request("https://prayerbox.example/api/health"), backendEnv());
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("launch_not_enabled");
  });
});
