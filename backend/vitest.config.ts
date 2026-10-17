import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // These hit a real (shared, network) Postgres instance — give them room.
    testTimeout: 20000,
    hookTimeout: 20000,
    fileParallelism: false,
    // Exclude stale compiled output in dist/ — without this, vitest's default
    // glob also picks up old *.test.js files left over from `npm run build`.
    exclude: ["**/node_modules/**", "dist/**"],
  },
});
