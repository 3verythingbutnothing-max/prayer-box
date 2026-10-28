import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest(async () => ({
    wrangler: { configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url).href) },
    miniflare: {
      bindings: { TEST_MIGRATIONS: await readD1Migrations(fileURLToPath(new URL("../migrations", import.meta.url).href)) },
    },
  }))],
  test: {
    include: ["backend/tests/*.test.ts"],
    exclude: ["backend/tests/policy.test.ts"],
    setupFiles: ["./backend/tests/setup.ts"],
    fileParallelism: false,
    testTimeout: 10000,
  },
});
