import { serve } from "@hono/node-server";
import { createMcpHonoApp } from "@modelcontextprotocol/hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
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

/**
 * RFC 9728. Served unauthenticated by design — this is the document a client
 * with no token fetches to discover which authorization server to use.
 */
app.get("/.well-known/oauth-protected-resource", (c) => c.json(protectedResourceMetadata()));

app.get("/health", (c) => c.json({ status: "ok", resource: CONFIG.resourceUrl }));

app.all("/mcp", async (c) => {
  const verified = await authenticate(c);
  if (verified instanceof Response) return verified;

  // Stateless: one server and transport per request. Nothing is shared between
  // callers, so one client's session can never observe another's.
  const server = createServer(verified.userId);
  const transport = new WebStandardStreamableHTTPServerTransport();

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
