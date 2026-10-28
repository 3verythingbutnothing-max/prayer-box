import { env } from "cloudflare:workers";
import { applyD1Migrations } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, vi } from "vitest";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(() => {
  // Unexpected public network traffic is a test failure, never an implicit provider call.
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outbound request in backend test"));
});

afterEach(() => vi.restoreAllMocks());

declare global {
  namespace Cloudflare {
    interface Env {
      TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
    }
  }
}
