import { serve } from "@hono/node-server";
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { cors } from "hono/cors";
import { authenticate, protectedResourceMetadata } from "./auth";
import { CONFIG } from "./config";
import { createServer } from "./tools";

/**
 * MCP server over Streamable HTTP, protected as an OAuth 2.1 resource server.
 *
 * `createMcpHonoApp` supplies Host and Origin validation for localhost binds,
 * which is the DNS-rebinding mitigation the MCP spec asks for.
 */
const app = createMcpHonoApp();

const isLoopback = (origin: string): boolean => {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
};

/**
 * Registered before the routes so a preflight is answered here and never reaches
 * `authenticate`. A preflight carries no credentials by definition, so requiring
 * a token on it would deadlock every browser client: it could not send the token
 * until the preflight it cannot pass has succeeded.
 *
 * `WWW-Authenticate` must be exposed explicitly — it is not a CORS-safelisted
 * response header, and it is the header carrying `resource_metadata`.
 */
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (CONFIG.allowedOrigins === "loopback") return isLoopback(origin) ? origin : undefined;
      return CONFIG.allowedOrigins.includes(origin) ? origin : undefined;
    },
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: [
      "authorization",
      "content-type",
      "mcp-session-id",
      "mcp-protocol-version",
      "last-event-id",
    ],
    exposeHeaders: ["WWW-Authenticate", "mcp-session-id"],
    maxAge: 86_400,
  }),
);

/**
 * RFC 9728. Served unauthenticated by design — this is the document a client
 * with no token fetches to discover which authorization server to use.
 *
 * Both spellings are served: RFC 9728 locates the metadata for a resource that
 * has a path at `/.well-known/oauth-protected-resource/<path>`, and clients
 * routinely probe that form for an endpoint like `/mcp` before falling back to
 * the root document.
 */
app.get("/.well-known/oauth-protected-resource", (c) => c.json(protectedResourceMetadata()));
app.get("/.well-known/oauth-protected-resource/mcp", (c) => c.json(protectedResourceMetadata()));

app.get("/health", (c) => c.json({ status: "ok", resource: CONFIG.resourceUrl }));

app.all("/mcp", async (c) => {
  const verified = await authenticate(c);
  if (verified instanceof Response) return verified;

  // Stateless: one server and transport per request. Nothing is shared between
  // callers, so one client's session can never observe another's.
  //
  // `enableJsonResponse` is what makes that disposal safe. Left off, the
  // transport answers with an SSE stream and `handleRequest` resolves while the
  // body is still being written — the cleanup below would then close the
  // transport mid-flight and the client would read an empty 200. With it,
  // `handleRequest` resolves only once the complete response exists.
  const server = createServer(verified.userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(c.req.raw);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
});

serve({ fetch: app.fetch, port: CONFIG.port }, (info) => {
  console.info(`MCP server listening on http://localhost:${info.port}/mcp`);
  console.info(`  resource:              ${CONFIG.resourceUrl}`);
  console.info(`  authorization server:  ${CONFIG.authorizationServer}`);
});
