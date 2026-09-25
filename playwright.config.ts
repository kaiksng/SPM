import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // CI also writes the HTML report so a failed run can be downloaded as an
  // artifact (see .github/workflows/ci.yml).
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      // CI serves the production build (built by the workflow beforehand);
      // locally the dev server keeps hot reload.
      command: isCI
        ? "pnpm --filter @spm/frontend preview --port 5173 --strictPort"
        : "pnpm --filter @spm/frontend dev",
      url: "http://localhost:5173",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
    {
      // No watch mode in CI. Not `node dist/index.js`: the compiled backend
      // cannot resolve its extensionless imports or @spm/shared's .ts source.
      command: isCI
        ? "pnpm --filter @spm/backend exec tsx src/index.ts"
        : "pnpm --filter @spm/backend dev",
      url: "http://localhost:3001/health",
      reuseExistingServer: !isCI,
      timeout: 120_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
