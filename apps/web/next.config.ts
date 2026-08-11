import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build step, so
  // Next compiles them alongside the app. This is what keeps `packages/core`
  // free of a bundling config of its own.
  transpilePackages: ["@rag/auth", "@rag/contracts", "@rag/core", "@rag/db"],

  // postgres.js and the Anthropic SDK are server-only; keeping them external
  // avoids Turbopack trying to bundle Node built-ins into the server chunk.
  serverExternalPackages: ["postgres", "@anthropic-ai/sdk"],

  typedRoutes: true,
};

export default nextConfig;
