import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Per-test time limit (default 5s). Component tests that drive whole forms
    // with userEvent run ~1-4s on a laptop and slower on a busy CI runner;
    // 15s removes that flakiness while a genuinely hung test still fails.
    testTimeout: 15_000,
    // Unit tests must never talk to the real (shared, hosted) Supabase. These
    // fixed fake values take precedence over .env.local, so tests behave the
    // same on every laptop and in CI, and a forgotten mock fails with a
    // connection error instead of reading or writing team data.
    env: {
      VITE_SUPABASE_URL: "http://127.0.0.1:54399",
      VITE_SUPABASE_PUBLISHABLE_KEY: "unit-test-publishable-key",
      VITE_BACKEND_URL: "http://127.0.0.1:54398",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
