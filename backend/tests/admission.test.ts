import { describe, expect, it, vi } from "vitest";
import { errorResponse, readJsonObject, requireTrustedOrigin } from "../src/http";
import { verifyTurnstile } from "../src/turnstile";

const validOptions = {
  token: "synthetic-token",
  secret: "synthetic-secret",
  expectedAction: "feedback",
  allowedHostnames: ["prayerbox.test"],
};

describe("server-side bot verification", () => {
  it("requires an exact affirmative verdict and sends credentials only to Siteverify", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => Response.json({ success: true, action: "feedback", hostname: "prayerbox.test" }));
    await verifyTurnstile({ ...validOptions, fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(String(init.body)).toBe("secret=synthetic-secret&response=synthetic-token");
  });

  it.each([undefined, null, "", " ", 42, "x".repeat(2049)])("rejects invalid tokens without outbound traffic (%s)", async (token) => {
    const fetcher = vi.fn();
    await expect(verifyTurnstile({ ...validOptions, token, fetcher })).rejects.toMatchObject({ status: 403, code: "bot_verification_required" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    { success: false, "error-codes": ["timeout-or-duplicate"] },
    { success: "true", action: "feedback", hostname: "prayerbox.test" },
    { success: true, action: "signup", hostname: "prayerbox.test" },
    { success: true, action: "feedback", hostname: "prayerbox.test.attacker.invalid" },
    { success: true, action: "feedback" },
  ])("rejects failure, replay, action mismatch and hostname mismatch", async (verdict) => {
    await expect(verifyTurnstile({ ...validOptions, fetcher: async () => Response.json(verdict) })).rejects.toMatchObject({ status: 403, code: "bot_verification_failed" });
  });

  it.each([
    () => new Response("provider failure containing secrets", { status: 503 }),
    () => new Response("not json"),
    () => Response.json(null),
    () => Response.json([]),
    () => new Response("x".repeat(16385)),
  ])("fails closed when provider response is unavailable, malformed or oversized", async (response) => {
    await expect(verifyTurnstile({ ...validOptions, fetcher: async () => response() })).rejects.toMatchObject({ status: 503, code: "bot_verification_unavailable" });
  });

  it("aborts slow verification and exposes accessible retry/help without leaking provider data", async () => {
    const fetcher = (_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new Error("private provider message")), { once: true });
    });
    let error: unknown;
    try { await verifyTurnstile({ ...validOptions, fetcher, timeoutMs: 5 }); } catch (caught) { error = caught; }
    const response = errorResponse(error);
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).toContain("/#help");
    expect(body).toContain("draft can stay open");
    expect(body).not.toMatch(/private provider|synthetic-token|synthetic-secret/);
  });

  it("does not bypass verification when secrets are absent", async () => {
    const fetcher = vi.fn();
    await expect(verifyTurnstile({ ...validOptions, secret: undefined, fetcher })).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("times out a hanging response stream after headers arrive", async () => {
    await expect(verifyTurnstile({ ...validOptions, timeoutMs: 5,
      fetcher: async () => new Response(new ReadableStream<Uint8Array>({ start() {} })),
    })).rejects.toMatchObject({ status: 503, code: "bot_verification_unavailable" });
  });

  it("rejects malformed UTF-8 rather than replacing invalid bytes", async () => {
    await expect(verifyTurnstile({ ...validOptions,
      fetcher: async () => new Response(new Uint8Array([0xff, 0xfe])),
    })).rejects.toMatchObject({ status: 503 });
  });

  it("enforces the provider response limit across multiple chunks", async () => {
    await expect(verifyTurnstile({ ...validOptions,
      fetcher: async () => new Response(new ReadableStream<Uint8Array>({ start(controller) {
        controller.enqueue(new Uint8Array(10000)); controller.enqueue(new Uint8Array(7000)); controller.close();
      } })),
    })).rejects.toMatchObject({ status: 503 });
  });
});

describe("request admission", () => {
  it.each([undefined, "null", "https://prayerbox.test.attacker.invalid", "https://attacker.invalid"])("rejects missing or hostile origins", (origin) => {
    const headers = new Headers();
    if (origin) headers.set("Origin", origin);
    expect(() => requireTrustedOrigin(new Request("https://prayerbox.test/api/feedback", { method: "POST", headers }), ["https://prayerbox.test"])).toThrow();
  });

  it("accepts the exact origin and rejects cross-site metadata", () => {
    const request = (fetchSite: string) => new Request("https://prayerbox.test/api/feedback", { method: "POST", headers: { Origin: "https://prayerbox.test", "Sec-Fetch-Site": fetchSite } });
    expect(() => requireTrustedOrigin(request("same-origin"), ["https://prayerbox.test"])).not.toThrow();
    expect(() => requireTrustedOrigin(request("cross-site"), ["https://prayerbox.test"])).toThrow();
  });

  it("bounds streamed JSON bytes rather than trusting Content-Length", async () => {
    const request = new Request("https://prayerbox.test/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: "x".repeat(128) }) });
    await expect(readJsonObject(request, { maxBytes: 64 })).rejects.toMatchObject({ status: 413 });
  });

  it.each(["null", "[]", "42", "{malformed"])("requires a JSON object", async (body) => {
    await expect(readJsonObject(new Request("https://prayerbox.test/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body }))).rejects.toMatchObject({ status: 400 });
  });

  it.each(["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"])("rejects a browser-simple content type (%s)", async (contentType) => {
    await expect(readJsonObject(new Request("https://prayerbox.test/api/feedback", { method: "POST", headers: { "Content-Type": contentType }, body: "{}" }))).rejects.toMatchObject({ status: 415 });
  });

  it("keeps all API output uncacheable and hides internal errors", async () => {
    const response = errorResponse(new Error("SELECT secret FROM users"));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).not.toContain("SELECT");
  });

  it("cancels a request body that stalls past the bounded JSON intake deadline", async () => {
    const cancel = vi.fn();
    const request = new Request("https://prayerbox.test/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" },
      body: new ReadableStream<Uint8Array>({ start() {}, cancel }),
    });
    await expect(readJsonObject(request, { timeoutMs: 5 })).rejects.toMatchObject({ status: 408, code: "request_timeout" });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
