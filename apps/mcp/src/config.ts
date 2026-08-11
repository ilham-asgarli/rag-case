import { loadRootEnv } from "@rag/db";

loadRootEnv();

/**
 * The authorization server as the *browser* sees it. Tokens are minted with
 * this origin in their `iss` claim, so it is what verification must compare
 * against.
 */
const authPublic = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

/**
 * The authorization server as *this process* can reach it.
 *
 * Under Docker these differ: the token says `http://localhost:3000` because
 * that is where the user signed in, but this container has to fetch the JWKS
 * over the compose network at `http://web:3000`. Verifying against the
 * internal URL would reject every valid token; fetching from the public URL
 * would fail to resolve. They are genuinely two different things.
 */
const authInternal = process.env.AUTH_INTERNAL_URL ?? authPublic;

export const CONFIG = {
  port: Number(process.env.MCP_PORT ?? 8787),
  /** This server's OAuth resource identifier. Tokens must carry it as `aud`. */
  resourceUrl: process.env.MCP_RESOURCE_URL ?? "http://localhost:8787",
  /** Advertised to clients, so it must be the publicly reachable origin. */
  authorizationServer: authPublic,
  issuer: `${authPublic}/api/auth`,
  jwksUrl: `${authInternal}/api/auth/jwks`,
} as const;
