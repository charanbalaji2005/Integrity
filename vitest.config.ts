import { defineConfig } from "vitest/config";

// Frontend unit/component tests (backend has its own backend/vitest.config.ts).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "dist", "backend"],
  },
});
