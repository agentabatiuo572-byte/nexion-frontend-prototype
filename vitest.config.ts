import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    env: {
      VITE_NEXGRID_API_DEV_BASE_URL: "http://127.0.0.1:8110",
    },
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/api/**/*.ts",
        "src/composables/use-remote-account-state.ts",
        "src/store/deposits-remote-policy.ts",
      ],
      exclude: ["src/api/**/*.test.ts", "src/api/contracts.ts", "src/api/runtime.ts"],
      thresholds: {
        perFile: true,
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
