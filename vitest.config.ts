import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Preserve Vitest 3 mock-history behavior after the v5 security upgrade.
    clearMocks: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: false,
  },
});
