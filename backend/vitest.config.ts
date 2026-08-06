import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // These hit a real (shared, network) Postgres instance — give them room.
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
  },
});
