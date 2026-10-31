import path from "node:path";
import { defineConfig } from "vitest/config";
import { assertDedicatedTarget } from "./scripts/integration-environment.mjs";

process.env.TZ = "Asia/Singapore";
assertDedicatedTarget(
  process.env.VITE_SUPABASE_URL,
  process.env.INTEGRATION_DATABASE_URL,
  process.env.INTEGRATION_PROJECT_ID,
);

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "apps/frontend/src") } },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.integration.test.ts"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    env: {
      VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL!,
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      VITE_BACKEND_URL: "http://127.0.0.1:15398",
    },
  },
});
