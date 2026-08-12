import { TokenVerificationError, type VerifiedToken, verifyBearerToken } from "@rag/auth/resource";
import { MCP_SEARCH_SCOPE } from "@rag/contracts";
import type { Context } from "hono";
import { CONFIG } from "./config";

/**
 * The `WWW-Authenticate` challenge from RFC 9728.
 *
 * `resource_metadata` is what lets an MCP client that arrives with no token
 * discover this server's metadata document, find the authorization server from
 * it, and complete the flow unattended. Without it a client can only fail.
 */
const challenge = (error: string, description: string): string =>
  [
    "Bearer",
    `error="${error}"`,
    `error_description="${description}"`,
    `resource_metadata="${CONFIG.resourceMetadataUrl}"`,
  ].join(" ");

export const unauthorized = (c: Context, description: string): Response =>
  c.json({ error: "unauthorized", error_description: description }, 401, {
    "WWW-Authenticate": challenge("invalid_token", description),
  });

const bearerFrom = (header: string | undefined): string | undefined => {
  if (!header) return undefined;
  const [scheme, value] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" ? value : undefined;
};

/**
 * Verifies the request's bearer token.
 *
 * Checks signature, issuer, audience, and the required scope. Audience is not
 * optional: without it this server would accept a token the same authorization
 * server minted for a completely different resource.
 */
export const authenticate = async (c: Context): Promise<VerifiedToken | Response> => {
  const token = bearerFrom(c.req.header("authorization"));

  if (!token) {
    return unauthorized(c, "An OAuth 2.1 access token is required.");
  }

  try {
    const verified = await verifyBearerToken(token, {
      issuer: CONFIG.issuer,
      audience: CONFIG.resourceUrl,
      jwksUrl: CONFIG.jwksUrl,
    });

    if (!verified.scopes.includes(MCP_SEARCH_SCOPE)) {
      return unauthorized(c, `The token is missing the ${MCP_SEARCH_SCOPE} scope.`);
    }

    return verified;
  } catch (error) {
    const message =
      error instanceof TokenVerificationError ? error.message : "Token verification failed.";
    // Logged server-side only — the client gets a stable, non-revealing message.
    console.warn("MCP token rejected:", message);
    return unauthorized(c, "The access token is invalid or expired.");
  }
};

/** RFC 9728 protected resource metadata. */
export const protectedResourceMetadata = () => ({
  resource: CONFIG.resourceUrl,
  // The issuer identifier, not the bare origin: a client derives the RFC 8414
  // metadata URL from this value, and the document it finds there must declare
  // exactly this issuer back. Advertising the origin sends clients to a URL
  // whose implied issuer disagrees with the document, which they reject.
  authorization_servers: [CONFIG.issuer],
  scopes_supported: [MCP_SEARCH_SCOPE],
  bearer_methods_supported: ["header"],
  resource_documentation: `${CONFIG.authorizationServer}/chat`,
});
