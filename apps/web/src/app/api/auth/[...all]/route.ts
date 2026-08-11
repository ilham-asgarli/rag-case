import { auth } from "@rag/auth";
import { toNextJsHandler } from "better-auth/next-js";

/**
 * Better Auth mounts every auth endpoint here, including the OAuth 2.1
 * authorization, token, and JWKS endpoints the MCP server relies on.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
