# AI usage log

Built with Claude Code (Claude Opus 5).

## What I had AI do

- Scaffolded the monorepo, packages, and tooling configuration
- Wrote the chunker, the hybrid-retrieval SQL, the ingestion pipeline, and the RAG layer
- Wrote the Next.js app, the MCP server, and the UI components
- Wrote the unit tests and the documentation
- Ran the migrations, the ingestion, and the verification probes

## What I decided myself

- Hybrid retrieval instead of dense-only, after reading the corpus and finding that 115 of 142
  documents share a template and answers depend on exact figures like "5 MB"
- Reciprocal Rank Fusion instead of blending scores, because cosine distance and `ts_rank_cd` are
  not comparable scales
- Anthropic's Citations API instead of `[1]` markers, so citations are verifiable
- Abstention measured from the citation count rather than promised in the prompt
- All SQL confined to `packages/db`
- Postgres + pgvector as the vector store, over a dedicated vector database
- Not using the Vercel AI SDK, because its message format drops the per-citation character
  offsets the UI is built on

## Where AI got it wrong

**Three APIs remembered incorrectly.** It believed the MCP package was
`@modelcontextprotocol/sdk` (v2 split into `/server`, `/client`, `/hono`); that Better Auth's
`mcp()` plugin still existed (removed in 1.6, superseded by `@better-auth/oauth-provider`); and
that `verifyAccessToken` came from `better-auth/oauth2` (it is on the resource client in
`@better-auth/oauth-provider/resource-client`).

**A false claim written into the project's own instruction files.** It asserted that `drizzle-kit`
cannot emit HNSW indexes, GIN indexes, or generated `tsvector` columns, and wrote that into
`AGENTS.md`, a rule file, and a skill. It emits all three; only `CREATE EXTENSION vector` is
missing.

**An eighteen-minute ingestion.** The pipeline embedded one document at a time, which on a corpus
where each document is a single chunk meant 142 sequential API calls instead of two. Fixing it
exposed a second problem: the retry backoff topped out at eight seconds, too short for the
account's 3-requests-per-minute limit, so ingestion would have failed on the free-tier key a
reviewer is most likely to use.

**An open redirect.** The sign-in page passed `?next=` straight to `router.push()`, so
`?next=https://evil.example` would have redirected a freshly authenticated user off-site.

**Two copies of `drizzle-orm`.** pnpm resolves it per peer-dependency context, so importing it
from two packages produced distinct copies whose types would not unify.

**Smaller ones.** A `boolean` column declared as `text`; a `//` comment inside a JSON array that
silently broke `biome.json` and reformatted the repo with tabs; `.js` import extensions Turbopack
could not resolve.

## How I caught them

- **Running it.** The eighteen-minute ingestion, the rate limit, and the abstention behaviour were
  only visible by executing the system and timing it — 39 documents after five minutes made the
  performance problem obvious.
- **The type checker**, under strict settings. It found the open redirect (via `typedRoutes`) and
  the duplicate `drizzle-orm`.
- **Reading the installed package** rather than the documentation, for every API the build depends
  on. All three misremembered APIs were caught by grepping the shipped `.d.mts` files and the npm
  registry.
- **Reading the generated SQL before applying it**, which is what exposed the false claim about
  `drizzle-kit`.
- **The production build**, which caught the import extensions.
- **28 unit tests** over chunking, rank fusion, and ingestion diffing — the places where
  correctness is subtle.
