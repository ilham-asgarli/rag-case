import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Unit tests cover pure logic only — chunking, rank fusion, citation
    // mapping, guards. Anything needing a database or a provider call is
    // verified through the acceptance checklist instead of a mock, because a
    // mocked retrieval test proves the mock works, not the retrieval.
    include: ["packages/*/src/**/*.test.ts", "apps/*/src/**/*.test.ts"],
    environment: "node",
    passWithNoTests: false,
  },
});
