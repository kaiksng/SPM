import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/test/**"],
    },
    // Only the TypeScript sources. `pnpm build:backend` also compiles the test
    // files into dist/, and those stale copies must never be run as tests.
    include: ["src/**/*.test.ts"],
  },
});
