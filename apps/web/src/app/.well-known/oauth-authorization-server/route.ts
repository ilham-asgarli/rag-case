import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@rag/auth";

/**
 * RFC 8414 authorization server metadata at the root well-known path.
 *
 * Better Auth serves this under its own base path, but MCP clients probe the
 * origin root. Exposing it here is what lets a client discover the
 * authorization and token endpoints without being configured by hand.
 */
export const GET = oauthProviderAuthServerMetadata(auth);
