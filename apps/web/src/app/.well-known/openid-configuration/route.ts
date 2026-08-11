import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@rag/auth";

/** OpenID Connect discovery, for clients that look here rather than RFC 8414. */
export const GET = oauthProviderOpenIdConfigMetadata(auth);
