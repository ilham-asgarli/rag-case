---
paths:
  - "apps/web/app/api/**"
  - "apps/web/src/server/**"
  - "apps/web/proxy.ts"
  - "apps/mcp/**"
---

# Security rules for request handling

## Every handler, in this order

1. **Authorize** — `requireSession()`, or `requireAdmin()` for anything under `/api/admin`.
2. **Parse** — run the body, query, and route params through their Zod schema from
   `@rag/contracts`. A handler that reads `body.foo` without parsing is a bug.
3. **Act** — call into `@rag/core`.

Never skip step 1 because `proxy.ts` already redirected. The proxy shapes navigation; it is not
an access-control boundary, and it does not run for every request path that reaches a handler.

## Responses

- Return the typed error shape from `@rag/contracts`. Never send an exception message, a stack
  trace, or a database error to the client — log it server-side and return a stable code.
- A missing resource the caller is not allowed to see returns the same status as one that does
  not exist. Do not leak existence through differing errors.

## Secrets

- No `process.env` access in a client component or any module reachable from one. Server-only
  values are read in `src/server/**` and passed down as plain data.
- Never log a token, session cookie, authorization header, or API key — not even truncated.

## Rate limiting

Any handler that triggers a model call (`/api/chat`, `/api/search`) is rate-limited per user.
An unauthenticated caller must not be able to spend Anthropic or Voyage budget.

## MCP server

- Verify the bearer token's **issuer**, **audience** (this server's resource URL), and required
  **scope** on every request. Verifying the signature alone is not sufficient — a token minted
  for a different resource must be rejected.
- An unauthenticated or invalid request returns `401` with a `WWW-Authenticate: Bearer` header
  carrying `resource_metadata`, so a compliant client can discover the authorization server.
- Tool inputs are untrusted. `get_document` resolves its `path` against the corpus root and
  rejects anything that escapes it; never concatenate a caller-supplied path into a filesystem
  or SQL operation.
