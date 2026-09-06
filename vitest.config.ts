import { defineConfig } from "vitest/config";

// Pure-logic tier only for now (plan validation, mapping, state binding).
// Component tests would add a jsdom project, as the core's ui/ does.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
