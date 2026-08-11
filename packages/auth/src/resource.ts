import { oauthProviderResourceClient } from "@better-auth/oauth-provider/resource-client";
import { MCP_SEARCH_SCOPE } from "@rag/contracts";
import { createAuthClient } from "better-auth/client";

/**
 * OAuth 2.1 resource-server verification, standalone.
 *
 * Deliberately does NOT import the `auth` instance: the MCP server is a
 * separate process and should not need the authorization server's secret or
 * database to check a token. It verifies the JWT signature against the
 * published JWKS and checks issuer, audience, and scope itself.
 */
const resourceClient = createAuthClient({
  plugins: [oauthProviderResourceClient()],
});

export interface VerifiedToken {
  /** Subject — the user the token was issued for. */
  userId: string;
  scopes: string[];
  clientId: string | undefined;
}

export interface ResourceConfig {
  /** Token issuer, e.g. http://localhost:3000/api/auth */
  issuer: string;
  /** This server's resource identifier. Tokens must carry it as `aud`. */
  audience: string;
  jwksUrl: string;
}

export class TokenVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

const toScopeArray = (scope: unknown): string[] => {
  if (Array.isArray(scope)) return scope.filter((s): s is string => typeof s === "string");
  if (typeof scope === "string") return scope.split(" ").filter(Boolean);
  return [];
};

/**
 * Verifies a bearer token and returns its subject.
 *
 * Checks the signature, the issuer, the audience, and the required scope.
 * Verifying only the signature would accept a token minted by the same
 * authorization server for a *different* resource, which is why audience is
 * not optional here.
 */
export const verifyBearerToken = async (
  token: string | undefined,
  config: ResourceConfig,
): Promise<VerifiedToken> => {
  if (!token) {
    throw new TokenVerificationError("Missing bearer token");
  }

  try {
    const payload = await resourceClient.verifyAccessToken(token, {
      verifyOptions: {
        issuer: config.issuer,
        audience: config.audience,
      },
      scopes: [MCP_SEARCH_SCOPE],
      jwksUrl: config.jwksUrl,
    });

    const subject = payload.sub;
    if (!subject) {
      throw new TokenVerificationError("Token has no subject");
    }

    return {
      userId: subject,
      scopes: toScopeArray(payload.scope ?? payload.scopes),
      clientId: typeof payload.client_id === "string" ? payload.client_id : undefined,
    };
  } catch (error) {
    if (error instanceof TokenVerificationError) throw error;
    throw new TokenVerificationError(
      error instanceof Error ? error.message : "Access token verification failed",
    );
  }
};
