export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryable: boolean;

  constructor(status: number, code: string, publicMessage: string, retryable = false) {
    super(publicMessage);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

/** Read actual streamed bytes; Content-Length is only an early rejection hint. */
export async function readBoundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("Invalid body limit");
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let cancellation: Promise<void> | undefined;
  const abort = () => { cancellation = reader.cancel().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    if (signal?.aborted) {
      abort();
      throw new HttpError(408, "request_timeout", "Please try again.", true);
    }
    while (true) {
      const { done, value } = await reader.read();
      if (signal?.aborted) throw new HttpError(408, "request_timeout", "Please try again.", true);
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new HttpError(413, "body_too_large", "This submission is too large.");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    signal?.removeEventListener("abort", abort);
    await cancellation;
    reader.releaseLock();
  }
}

export async function readJsonObject(
  request: Request,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  const maxBytes = options.maxBytes ?? 16_384;
  const timeoutMs = options.timeoutMs ?? 20_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("Invalid body timeout");
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?\s*$/i.test(contentType)) {
    throw new HttpError(415, "unsupported_content_type", "Send this submission as JSON.");
  }
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    throw new HttpError(413, "body_too_large", "This submission is too large.");
  }
  const bytes = await readBoundedBytes(request.body, maxBytes,
    AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]));
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
  } catch {
    throw new HttpError(400, "invalid_json", "Please check the submission and try again.");
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "invalid_json", "Please check the submission and try again.");
  }
  return value as Record<string, unknown>;
}

/** Unsafe browser requests require the exact deployment origin, never a suffix match. */
export function requireTrustedOrigin(request: Request, allowedOrigins: readonly string[]): void {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return;
  const origin = request.headers.get("origin");
  if (!origin || origin === "null" || !allowedOrigins.includes(origin)) {
    throw new HttpError(403, "untrusted_origin", "This request is not available.");
  }
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new HttpError(403, "untrusted_origin", "This request is not available.");
  }
}

export function jsonResponse(value: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

export function errorResponse(error: unknown): Response {
  const known = error instanceof HttpError;
  const code = known ? error.code : "internal_error";
  return jsonResponse({
    error: {
      code,
      message: known ? error.message : "Something went wrong. Please try again.",
      retryable: known ? error.retryable : true,
      ...(code.startsWith("bot_") ? {
        retry: "Refresh verification and try again. Your draft can stay open.",
        helpPath: "/#help",
      } : {}),
    },
  }, known ? error.status : 500);
}
