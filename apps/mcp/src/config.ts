import { loadRootEnv } from "@rag/db";

loadRootEnv();

const authBase = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const CONFIG = {
  port: Number(process.env.MCP_PORT ?? 8787),
  /** This server's OAuth resource identifier. Tokens must carry it as `aud`. */
  resourceUrl: process.env.MCP_RESOURCE_URL ?? "http://localhost:8787",
  authorizationServer: authBase,
  issuer: `${authBase}/api/auth`,
  jwksUrl: `${authBase}/api/auth/jwks`,
} as const;
