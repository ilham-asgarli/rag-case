# rag-case

Grounded RAG over a markdown corpus. Hybrid retrieval (pgvector + Postgres full-text, fused with
Reciprocal Rank Fusion), Voyage reranking, and Claude answers carrying verifiable citations.

Two servers run: `apps/web` (Next.js, port 3000) and `apps/mcp` (MCP over Streamable HTTP,
port 8787).

## Commands

| Task | Command |
| --- | --- |
| Start Postgres + pgvector | `docker compose up -d` |
| Install dependencies | `pnpm install` |
| Apply migrations | `pnpm db:migrate` |
| Seed demo users | `pnpm db:seed` |
| Index `data/corpus` | `pnpm ingest` |
| Re-index on file change | `pnpm ingest --watch` |
| Run both servers | `pnpm dev` |
| Typecheck + lint + test | `pnpm verify` |
| One test file | `pnpm vitest run <path>` |
| Inspect the MCP server | `pnpm mcp:inspect` |

`pnpm verify` must pass before every commit.

## Architecture rules

- Domain logic lives in `packages/core`. Route handlers, MCP tools, and the ingest CLI are thin
  adapters over the same functions. Never reimplement retrieval or RAG inside `apps/`.
- Every value crossing a process boundary is described by a Zod schema in `packages/contracts`.
  Import the inferred type; never hand-write a parallel interface.
- **YOU MUST** call `requireSession()` or `requireAdmin()` inside every protected route handler
  and server component. `apps/web/proxy.ts` is defense-in-depth and is never the authorization
  decision.
- No `any`. No non-null assertion (`!`) on a value that crossed a boundary — parse it instead.

## Pinned models

| Role | Model |
| --- | --- |
| Grounded answers | `claude-opus-5` |
| Query rewriting | `claude-haiku-4-5` |
| Embeddings | `voyage-4`, 1024 dimensions |
| Reranking | `rerank-2.5-lite` |

Do not substitute these. Changing the embedding model or its dimension count requires a
`vector(n)` migration **and** a full re-ingest — the two must ship in the same commit.

## Gotchas

- **Next.js 16**: the file is `proxy.ts`, not `middleware.ts`. `params`, `searchParams`,
  `cookies()`, and `headers()` are async. `revalidateTag` takes two arguments. `next lint` no
  longer exists — lint with `pnpm lint` (Biome).
- **Anthropic citations return 400 when combined with `output_config.format`.** Grounded answers
  are prose plus citation blocks; they are never structured output.
- **Abstention is measured, not prompted.** Zero citation deltas in a response means
  `abstained: true`. When a question that should be answerable comes back abstained, fix
  retrieval — never loosen the grounding prompt to force an answer.
- **pgvector**: `drizzle-kit` cannot emit HNSW or GIN index statements, so they are hand-added to
  the generated migration SQL. Run `ANALYZE` after a bulk ingest or the planner ignores them.
- **Voyage `input_type` is asymmetric**: `"document"` when indexing, `"query"` when searching.
  Swapping them silently degrades recall and raises no error.
- **`data/corpus` is source data.** Never reformat, regenerate, or lint it.

## Conventions

- Conventional Commits, one logical change per commit.
- Never commit `.env`. `.env.example` is the documented contract.
- Tests cover pure logic only — chunking, rank fusion, citation mapping, guards. No mocked HTTP.
