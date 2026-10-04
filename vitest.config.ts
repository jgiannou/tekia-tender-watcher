import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // SaaS tests share the dedicated tekia_tender_watcher_test DB and reset tables.
    fileParallelism: false,
  },
});
