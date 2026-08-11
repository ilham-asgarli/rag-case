# Lumen Corpus — semantic search and grounded answers

A TypeScript monorepo that indexes a Markdown corpus into a vector store, retrieves from it with
hybrid search, and answers questions with **verifiable citations** — every claim carries the exact
sentence that supports it. The same retrieval is exposed as an MCP tool for external clients,
behind OAuth 2.1.

Built for the Playable Factory AI Software Engineer case study.

---

## What it does

- **Chat** — ask a question, watch the answer stream in, and see the precise sentence behind each
  claim highlighted in its source passage.
- **Honest abstention** — when the corpus does not contain the answer, it says so and cites
  nothing. This is *measured*, not promised: an answer with zero citations is flagged
  automatically, so the model cannot bluff past it.
- **Dashboard** — index health, per-document status, ingestion history with a re-index trigger,
  search analytics, and user management. Admin only.
- **MCP server** — `search_corpus` and `get_document` over Streamable HTTP, protected as an
  OAuth 2.1 resource server.
- **Self-updating ingestion** — content-hash diffing, so editing one file re-embeds one document.

---

## Quick start

Requires **Node 22+**, **pnpm 11+**, and **Docker**.

```bash
# 1. Configuration
cp .env.example .env
#    Add ANTHROPIC_API_KEY and VOYAGE_API_KEY (both have free tiers).
#    Generate a secret:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 2. Database (PostgreSQL 18 + pgvector)
docker compose up -d

# 3. Install, migrate, seed
pnpm install
pnpm db:migrate
pnpm db:seed

# 4. Index the corpus (committed at data/corpus, 142 documents)
pnpm ingest

# 5. Run both servers
pnpm dev
```

| Service | URL |
| --- | --- |
| Web app (chat + dashboard) | http://localhost:3000 |
| MCP server | http://localhost:8787/mcp |

### Demo credentials

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@lumen.test` | `admin-password-123` |
| User | `user@lumen.test` | `user-password-1234` |

The admin sees the dashboard; the regular user does not, and is refused by the API as well as the
UI.

---

## Technology

| Concern | Choice | Why |
| --- | --- | --- |
| Monorepo | pnpm workspaces + Turborepo | Catalog pins every shared version in one place |
| Language | TypeScript 7 | Go-native compiler; Next 16.3 uses it for build typechecking |
| Web | Next.js 16.3 (App Router), React 19.2 | Turbopack by default |
| Styling | Tailwind CSS v4 | CSS-first `@theme`; every colour is a token |
| Lint/format | Biome 2.5 | `next lint` was removed in Next 16; Biome avoids the typescript-eslint ↔ TS 7 gap |
| Database | PostgreSQL 18 + pgvector 0.8.6 | One store for relational data *and* vectors |
| ORM | Drizzle | Typed schema, plain SQL when it matters |
| Auth | Better Auth + `@better-auth/oauth-provider` | Sessions, roles, and an OAuth 2.1/OIDC provider in one library |
| MCP | `@modelcontextprotocol/server` v2 + Hono | Streamable HTTP with built-in DNS-rebinding protection |
| Answers | `claude-opus-5` | Native Citations API — the core design bet |
| Query rewriting | `claude-haiku-4-5` | Sub-200 ms, negligible cost |
| Embeddings | Voyage `voyage-4` (1024d) | Anthropic's recommended partner |
| Reranking | Voyage `rerank-2.5-lite` | The biggest quality lever on this corpus |
| Validation | Zod 4 | One schema set across HTTP, SSE, and MCP |
| Tests | Vitest | Unit tests on pure logic |

---

## Architecture

```
apps/
  web/        Next.js — chat, dashboard, HTTP API, OAuth 2.1 authorization server
  mcp/        Hono + MCP SDK — Streamable HTTP server, OAuth resource server
packages/
  contracts/  Zod schemas + inferred types for every boundary
  core/       Domain logic — chunking, providers, retrieval, RAG, ingestion
  db/         Drizzle schema, migrations, and every SQL statement in the system
  auth/       Authorization server + standalone resource-server verification
tools/ingest/ CLI: one-shot and watch mode
data/corpus/  The indexed corpus (committed)
```

**Domain logic lives in `packages/core` and is framework-agnostic.** The Next.js route handlers,
the MCP tools, and the ingest CLI are three thin adapters over the same `search()`, `answer()`,
and `ingest()` functions. That is the backend architecture — not an HTTP hop between two Node
processes, which would only duplicate auth and serialization.

**`packages/contracts` is the typed boundary.** One Zod schema defines a wire shape; the server,
the browser, and the MCP server all import the inferred type. A response cannot drift from its
consumer.

**All SQL is confined to `packages/db`.** Besides layering, this is load-bearing: pnpm resolves
`drizzle-orm` per peer-dependency context, so importing it from two packages produces two
physically distinct copies whose types do not unify.

---

## How retrieval works

The corpus shape drives the design. 142 documents, ~110 KB, but **115 of them are near-duplicate
delivery reports and meeting notes sharing a template**, and the answers hinge on exact tokens
like "5 MB", "180 KB", and `LumenSDK.init`.

### 1. Chunking

Heading-aware. Sections split on ATX headings, carry a heading breadcrumb, merge forward when
small, and split on paragraph boundaries when oversized.

On this corpus that produces **exactly one chunk per document** (max 233 tokens). That is
correct, not a shortcut: these files are already at the granularity a retriever wants, and
splitting a 500-byte document destroys the context that makes it findable.

The heading breadcrumb is prepended to the text that gets *embedded* but stored separately from
the chunk body, because citations must quote only the body.

### 2. Hybrid retrieval

One SQL statement runs both arms and fuses them:

- **Dense** — pgvector HNSW, cosine distance
- **Lexical** — Postgres `tsvector` + GIN, ranked by `ts_rank_cd`
- **Fusion** — Reciprocal Rank Fusion (`k = 60`, 40 candidates per arm)

Fusing by **rank** rather than score is deliberate: cosine distance and `ts_rank_cd` are not on
comparable scales, so any weighted blend of the two values would be arbitrary and need per-corpus
tuning. Rank fusion needs only `k`.

Dense-only retrieval fails badly here — it cannot distinguish 115 documents that share a
template, and it misses exact figures.

### 3. Reranking

The 20 fused candidates go to `rerank-2.5-lite`, which returns the final passages. This is what
separates March's Waffle Rush delivery report from March's Tidal Tycoon one.

### 4. Grounded answers

Each retrieved chunk is sent as its own Anthropic `document` block with `citations: { enabled:
true }`. Claude returns citations with **character offsets into the exact chunk text**, which is
what lets the UI highlight the precise supporting sentence rather than gesturing at a document.

Document order is load-bearing: a citation's `document_index` indexes the array of blocks, so the
sources array and the block order must stay aligned.

> Citations and structured outputs are mutually exclusive in the API — enabling both returns 400.
> That is why the answer is prose plus citation blocks rather than a JSON schema.

### 5. Abstention

The system prompt requires an explicit "not in this corpus" with no citation. **Independently,
the server counts citation deltas: zero citations means the answer is flagged `abstained`.** A
prompt cannot enforce itself, so the check lives in the transport. The UI renders that as its own
state, so a reader can tell honesty from failure.

---

## Ingestion

```bash
pnpm ingest              # index changed documents
pnpm ingest --watch      # re-index on file change
pnpm ingest --force      # re-embed everything (needed after a model change)
```

Documents are identified by SHA-256 of their bytes. A run classifies every file as **added**,
**changed**, **unchanged**, or **removed**, and only embeds the first two — so re-running after
editing one file costs one embedding call, not 142.

Each document's chunks are replaced inside a transaction, so a reader mid-ingest sees the old
version or the new one, never a partial set. A failure on one document is recorded against that
document and does not abort the run.

Every run writes an `ingestion_runs` row with counts, duration, and errors, which is what the
dashboard displays. The same code path serves the CLI, watch mode, and the dashboard's
**Re-index** button.

> `.gitattributes` pins line endings to LF. This is load-bearing: the content hash is computed
> over file bytes, so a CRLF checkout on Windows would make every document look changed, and
> citation offsets would drift by one per preceding line.

---

## Security

| Control | Where |
| --- | --- |
| Session validation | `requireSession()` in every protected handler and server component |
| Role check | `requireAdmin()` — returns 403, distinct from 401 |
| Input validation | Every body and query parsed through a Zod schema before use |
| Error hygiene | Stable error codes; exception text and stack traces are logged, never returned |
| Rate limiting | Per user on `/api/chat`, `/api/search`, and re-index |
| Open redirect | `?next=` resolved against an allowlist |
| Secrets | Env only; `.env` gitignored, `.env.example` committed |

**`proxy.ts` is not the authorization boundary.** Next.js 16 renamed `middleware.ts` to
`proxy.ts`; this app uses it only to shape navigation, so a signed-out visitor lands on sign-in
instead of an empty page. It deliberately does not read roles — a cookie's presence says nothing
about its validity. Every decision is made by a guard that validates the session against the
database.

Verified behaviour:

```
signed out            → 401 on /api/admin/*  and /api/chat
signed in, non-admin  → 403 on /api/admin/*, 200 on /api/search
signed in, admin      → 200 on /api/admin/*
```

The middle row is the important one: it proves the handler guard, not the proxy, is enforcing
access.

---

## MCP server

Two tools, both read-only:

| Tool | Purpose |
| --- | --- |
| `search_corpus` | Ranked passages with path, heading, and relevance scores |
| `get_document` | Full text of one document, looked up by indexed path |

`get_document` resolves by exact indexed path rather than reading from disk, so a caller-supplied
string can never traverse the filesystem.

### Authentication (OAuth 2.1 / OIDC)

The web app is the **authorization server** (`@better-auth/oauth-provider`), publishing discovery
at `/.well-known/oauth-authorization-server` and `/.well-known/openid-configuration`, with RFC
7591 dynamic client registration so a client can register itself at connect time.

The MCP server is a **protected resource**. It verifies the bearer token's signature against the
published JWKS and checks **issuer, audience, and scope** — audience is not optional, or it would
accept a token minted for a different resource. It needs neither the authorization server's
secret nor its database.

An unauthenticated request gets the RFC 9728 challenge that makes discovery automatic:

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token"
  error_description="An OAuth 2.1 access token is required."
  resource_metadata="http://localhost:8787/.well-known/oauth-protected-resource"
```

### Connecting

**MCP Inspector**

```bash
pnpm mcp:inspect
# Transport: Streamable HTTP   URL: http://localhost:8787/mcp
# Inspector discovers the authorization server and runs the OAuth flow;
# sign in and approve on the consent screen.
```

**Claude Code**

```bash
claude mcp add --transport http lumen-corpus http://localhost:8787/mcp
```

MCP calls are attributed to the token's subject and appear in dashboard analytics with source
`mcp`, alongside in-app usage.

---

## Commands

| Command | Does |
| --- | --- |
| `pnpm dev` | Run both servers |
| `pnpm build` | Production build |
| `pnpm verify` | Typecheck, lint, and test |
| `pnpm test` | Unit tests |
| `pnpm db:migrate` / `db:seed` / `db:analyze` / `db:studio` | Database tasks |
| `pnpm ingest` | Index the corpus |
| `pnpm mcp:inspect` | Launch MCP Inspector |

---

## API

All endpoints require a session cookie. Errors share one shape:
`{ "error": { "code": "...", "message": "..." } }`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/chat` | Grounded answer, streamed as SSE |
| `POST` | `/api/search` | Retrieval only, JSON |
| `GET` | `/api/admin/documents` | Indexed documents (admin) |
| `GET` | `/api/admin/documents/[id]` | One document with its chunks (admin) |
| `GET`/`POST` | `/api/admin/ingest` | Run history / trigger a re-index (admin) |
| `GET` | `/api/admin/stats` | Index health and search analytics (admin) |
| `GET`/`POST`/`PATCH` | `/api/admin/users` | List, invite, change role (admin) |
| `*` | `/api/auth/*` | Better Auth, including OAuth 2.1 endpoints |

**Search**

```bash
curl -X POST http://localhost:3000/api/search \
  -H 'content-type: application/json' -b cookies.txt \
  -d '{"query":"maximum file size for an AppLovin playable","limit":5}'
```

**Chat** streams SSE events in a fixed order — one `sources`, then interleaved `delta` and
`citation`, then a terminal `done` or `error`:

```
data: {"type":"sources","sources":[…],"retrievalMs":412}
data: {"type":"delta","text":"The maximum is "}
data: {"type":"citation","citation":{"path":"network-specs-applovin.md","citedText":"Maximum file size: 5 MB…","startCharIndex":118,"endCharIndex":163}}
data: {"type":"done","abstained":false,"citationCount":2,"totalMs":3180}
```

---

## Testing

`pnpm test` covers the pure logic where correctness is subtle and a mock would prove nothing:

- **Chunking** — heading breadcrumbs, depth changes, fenced code blocks, overlap, small-section
  merging
- **Rank fusion** — the RRF formula, agreement across arms beating a better single-arm rank,
  the effect of `k`
- **Ingestion diffing** — added/changed/unchanged/removed, renames, `--force`, and that every
  source document lands in exactly one bucket

Retrieval quality and answer grounding are verified against the live system rather than mocked,
because a mocked retrieval test proves the mock works.

---

## Deployment

Not deployed. The shape it is built for:

| Piece | Target | Notes |
| --- | --- | --- |
| `apps/web` | Vercel | Set every variable from `.env.example`; `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` must be the public origin |
| Database | Neon or Supabase | Both ship pgvector. Run `pnpm db:migrate`, then `pnpm db:seed` |
| `apps/mcp` | Railway, Fly.io, or a container | Set `MCP_RESOURCE_URL` to its public URL — it is the token audience, so it must match exactly |
| Corpus | Committed | Run `pnpm ingest` once after deploy, or trigger it from the dashboard |

Two things would change for real production use, both deliberate omissions rather than
oversights:

- **Rate limiting is in-process.** It stops one authenticated user looping through the provider
  budget, but a multi-instance deployment needs a shared store such as Redis.
- **Re-index runs inline.** Fine at 142 documents; a larger corpus wants a job queue so the
  request does not hold a connection for the duration.

---

## Design decisions

**Postgres for vectors.** One datastore for users, documents, vectors, and analytics means hybrid
search happens in a single SQL statement instead of a join across two systems, and local setup is
one `docker compose up`.

**Anthropic's Citations API over hand-rolled citation markers.** Asking a model to emit `[1]`
markers produces something that looks like a citation but cannot be verified. The API returns
character offsets, and `cited_text` costs no output tokens in either direction.

**The Vercel AI SDK is not used.** Its message format does not surface the per-citation character
offsets this UI is built around, and it is mid-migration across major versions. The replacement
is ~60 lines of `fetch` plus a Zod-validated event schema shared by both sides.

**No prompt caching.** The documents differ per query and the system prompt is under Opus 5's
512-token cache minimum, so `cache_control` here would be cargo cult.

**Seven UI primitives, hand-written.** Each is under twenty lines; a component library would cost
more to configure than to write.

---

## Repository conventions

- Conventional Commits, one logical change per commit
- `pnpm verify` passes before every commit
- `AGENTS.md` and `.claude/` configure AI assistants working in this repo — see
  [`AI_USAGE.md`](./AI_USAGE.md) for how AI was used to build it
