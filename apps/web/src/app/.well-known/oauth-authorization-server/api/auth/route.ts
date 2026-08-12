import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@rag/auth";

/**
 * RFC 8414 authorization server metadata.
 *
 * The path is not arbitrary. This server's issuer is `<origin>/api/auth`, and
 * §3.1 locates the metadata for an issuer that has a path by inserting the
 * well-known segment between the host and that path — hence
 * `/.well-known/oauth-authorization-server/api/auth`.
 *
 * Serving the same document at the origin root instead would break §3.3: that
 * URL asserts an issuer of `<origin>`, which is not the issuer inside the
 * document, and a conforming client rejects the mismatch rather than guessing.
 * Clients reach this URL by deriving it from the `authorization_servers` entry
 * the MCP server advertises, which is the issuer identifier.
 */
export const GET = oauthProviderAuthServerMetadata(auth);
