import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    setupFiles: ["__tests__/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    pool: "forks",
    maxWorkers: 1,
    coverage: {
      provider: "v8",
      include: ["app/api/**/*.ts"],
      exclude: ["app/api/auth/**"],
      reporter: ["text", "json-summary"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
