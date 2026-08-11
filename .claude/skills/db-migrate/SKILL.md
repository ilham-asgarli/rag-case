---
name: db-migrate
description: Generate, hand-patch, and apply a Drizzle migration for this project, including the pgvector and full-text statements drizzle-kit cannot emit. Use after any change to the schema in packages/db.
disable-model-invocation: true
---

drizzle-kit 0.31 emits the HNSW index, the GIN index, and the generated `tsvector` column from
the schema definitions. It does **not** emit `CREATE EXTENSION vector`, without which the
`vector(1024)` column type does not exist and the migration fails on a fresh database.

## Steps

1. **Generate**

   ```
   pnpm db:generate
   ```

2. **Read the emitted SQL** in `packages/db/migrations/`. Do not skip this. Confirm it does what
   the schema change intended and nothing more — a rename that drizzle-kit reads as drop-then-add
   destroys data.

3. **Patch** the first migration so it begins with the extension:

   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
   ```

   Then confirm the migration actually contains these three, and hand-add any that are missing:

   ```sql
   "embedding" vector(1024)
   "tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(heading_text, '') || ' ' || content)) STORED
   CREATE INDEX "chunks_embedding_hnsw_idx" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);
   CREATE INDEX "chunks_tsv_gin_idx" ON "chunks" USING gin ("tsv");
   ```

4. **Apply**

   ```
   pnpm db:migrate
   ```

5. **Re-ingest if the vector column changed.** A dimension change invalidates every stored
   embedding:

   ```
   pnpm ingest --force
   ```

6. **Analyze** after any bulk write, or the planner will ignore the new indexes:

   ```
   pnpm db:analyze
   ```

## Verify

Confirm both indexes exist and are used:

```sql
\d+ chunks
EXPLAIN ANALYZE SELECT id FROM chunks ORDER BY embedding <=> '[...]'::vector LIMIT 5;
```

The plan must show an index scan, not a sequential scan. If it shows a sequential scan on a
populated table, step 6 was skipped.

## Never

Edit a migration that has already been applied. Add a new one instead.
