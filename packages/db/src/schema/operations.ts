import type { IngestionCounts } from "@rag/contracts";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const ingestionTriggerEnum = pgEnum("ingestion_trigger", ["cli", "watch", "dashboard"]);
export const ingestionStatusEnum = pgEnum("ingestion_status", ["running", "succeeded", "failed"]);

/**
 * One row per ingestion attempt. This is the "observable" half of the case's
 * ingestion requirement: what was indexed, when, and whether it succeeded.
 */
export const ingestionRuns = pgTable(
  "ingestion_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trigger: ingestionTriggerEnum("trigger").notNull(),
    status: ingestionStatusEnum("status").notNull().default("running"),
    counts: jsonb("counts")
      .$type<IngestionCounts>()
      .notNull()
      .default({ added: 0, updated: 0, unchanged: 0, removed: 0, failed: 0 }),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (table) => [index("ingestion_runs_started_at_idx").on(table.startedAt)],
);

export const searchSourceEnum = pgEnum("search_source", ["chat", "search", "mcp"]);

/**
 * One row per search. Powers the dashboard's analytics, and attributes MCP
 * traffic so tool calls made by an external client are visible alongside
 * in-app usage.
 */
export const searchQueries = pgTable(
  "search_queries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null is possible in principle; in practice every surface is authenticated. */
    userId: text("user_id"),
    source: searchSourceEnum("source").notNull(),
    query: text("query").notNull(),
    rewrittenQuery: text("rewritten_query"),
    resultCount: integer("result_count").notNull().default(0),
    topScore: real("top_score"),
    latencyMs: integer("latency_ms").notNull(),
    /** Only meaningful for `chat`: the answer produced no citations. */
    abstained: boolean("abstained"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("search_queries_created_at_idx").on(table.createdAt),
    index("search_queries_source_idx").on(table.source),
  ],
);

export type IngestionRunRow = typeof ingestionRuns.$inferSelect;
export type NewIngestionRunRow = typeof ingestionRuns.$inferInsert;
export type SearchQueryRow = typeof searchQueries.$inferSelect;
export type NewSearchQueryRow = typeof searchQueries.$inferInsert;
