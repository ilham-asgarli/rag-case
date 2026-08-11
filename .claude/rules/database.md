---
paths:
  - "packages/db/**"
---

# Database rules

## Migration flow

The Drizzle schema is the source of truth. Migrations are **generated from it, then reviewed** —
never authored from scratch, and never edited once applied. To change an applied migration, add
a new one. Use `/db-migrate` for the full sequence.

## What drizzle-kit does and does not emit

Verified against drizzle-kit 0.31.10. It **does** emit, from the schema definitions:

- `CREATE INDEX ... USING hnsw (embedding vector_cosine_ops)`
- `CREATE INDEX ... USING gin (tsv)`
- the `tsv` column as `GENERATED ALWAYS AS (to_tsvector('english', ...)) STORED`

It does **not** emit `CREATE EXTENSION IF NOT EXISTS vector`. Without that statement the
`vector(1024)` column type does not exist and the migration fails on a fresh database, so add it
as the first statement of the first migration.

Still read every generated migration before applying it. A rename that drizzle-kit reads as
drop-then-add will destroy data regardless of what it gets right elsewhere.

## Invariants

- The `vector(n)` dimension must equal the embedding model's output dimension (`voyage-4` →
  1024). A mismatch fails at insert time with an opaque error, so change the column and the
  model in the same commit and re-ingest.
- `chunks` cascade-delete with their `documents` row. Re-indexing a document replaces its chunks
  inside one transaction — there is never a window where a document has partial chunks.
- `documents.path` is unique and is the identity used by the ingestion diff. It is stored
  POSIX-style and relative to the corpus root, on every platform.

## After bulk writes

Run `ANALYZE chunks` after an ingest that touched many rows. Without fresh statistics the
planner will sequential-scan and the HNSW index appears to "not work".

## Seeds

`seed.ts` is idempotent — it upserts. Running it twice must not create duplicate users or throw.
