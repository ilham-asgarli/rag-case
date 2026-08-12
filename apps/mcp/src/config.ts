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

/**
 * Browser-based MCP clients — MCP Inspector, and anything else served from a
 * different origin — call this server directly with `fetch`, so without CORS the
 * browser blocks the response before the client can read the 401 challenge that
 * starts the OAuth flow. An explicit list is required in production; local
 * development allows any loopback origin, since the port varies per tool.
 */
const parseAllowedOrigins = (raw: string | undefined): string[] | "loopback" => {
  const entries = (raw ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : "loopback";
};

/**
 * This server's OAuth resource identifier — the MCP endpoint URL itself, which
 * is what a client sends as RFC 8707 `resource` and what it expects to read back
 * from the metadata document.
 */
const resourceUrl = process.env.MCP_RESOURCE_URL ?? "http://localhost:8787/mcp";

/**
 * RFC 9728 §3.1: metadata for a resource whose identifier has a path lives at
 * that path appended to the well-known segment, not underneath the resource.
 * For `http://host/mcp` that is `http://host/.well-known/oauth-protected-resource/mcp`.
 */
const resourceMetadataPath = (() => {
  const { pathname } = new URL(resourceUrl);
  const suffix = pathname === "/" ? "" : pathname;
  return `/.well-known/oauth-protected-resource${suffix}`;
})();

export const CONFIG = {
  port: Number(process.env.MCP_PORT ?? 8787),
  allowedOrigins: parseAllowedOrigins(process.env.MCP_ALLOWED_ORIGINS),
  /** This server's OAuth resource identifier. Tokens must carry it as `aud`. */
  resourceUrl,
  resourceMetadataPath,
  resourceMetadataUrl: `${new URL(resourceUrl).origin}${resourceMetadataPath}`,
  /** Advertised to clients, so it must be the publicly reachable origin. */
  authorizationServer: authPublic,
  issuer: `${authPublic}/api/auth`,
  jwksUrl: `${authInternal}/api/auth/jwks`,
} as const;
