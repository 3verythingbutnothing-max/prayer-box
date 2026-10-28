import { HttpError, readBoundedBytes } from "./http";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
type SiteverifyFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface TurnstileOptions {
  token: unknown;
  secret: string | undefined;
  expectedAction: string;
  allowedHostnames: readonly string[];
  /** Dependency injection is for tests; request input must never choose a transport. */
  fetcher?: SiteverifyFetch;
  timeoutMs?: number;
}

/** Tokens are redeemed once at Siteverify; there is deliberately no local bypass. */
export async function verifyTurnstile(options: TurnstileOptions): Promise<void> {
  const { token, secret, expectedAction, allowedHostnames } = options;
  if (typeof token !== "string" || token.length < 1 || token.length > 2048 || !token.trim()) {
    throw new HttpError(403, "bot_verification_required", "Please complete verification and try again.", true);
  }
  if (!secret?.trim() || !/^[A-Za-z0-9_-]{1,32}$/.test(expectedAction) ||
      allowedHostnames.length === 0 || allowedHostnames.some((host) => !host || /[\s/:*]/.test(host))) {
    throw new HttpError(503, "bot_verification_unavailable", "Verification is temporarily unavailable. Please try again.", true);
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 10_000) {
    throw new Error("Invalid verification timeout");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let result: unknown;
  try {
    const response = await (options.fetcher ?? fetch)(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("Verification provider failed");
    const bytes = await readBoundedBytes(response.body, 16_384, controller.signal);
    result = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    // Provider errors, response bodies and tokens never enter logs or API errors.
    throw new HttpError(503, "bot_verification_unavailable", "Verification is temporarily unavailable. Please try again.", true);
  } finally {
    clearTimeout(timeout);
  }
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new HttpError(503, "bot_verification_unavailable", "Verification is temporarily unavailable. Please try again.", true);
  }
  const verdict = result as Record<string, unknown>;
  if (verdict.success !== true || verdict.action !== expectedAction ||
      typeof verdict.hostname !== "string" || !allowedHostnames.includes(verdict.hostname)) {
    throw new HttpError(403, "bot_verification_failed", "Verification could not be completed. Please try again.", true);
  }
}
