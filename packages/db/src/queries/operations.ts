import type { IngestionCounts, IngestionTrigger, SearchSource } from "@rag/contracts";
import { eq } from "drizzle-orm";
import { getDb } from "../client.js";
import { ingestionRuns, searchQueries } from "../schema/operations.js";

export const startIngestionRun = async (trigger: IngestionTrigger): Promise<string> => {
  const [row] = await getDb()
    .insert(ingestionRuns)
    .values({ trigger, status: "running" })
    .returning({ id: ingestionRuns.id });

  if (!row) throw new Error("Failed to create ingestion run");
  return row.id;
};

export const finishIngestionRun = async (args: {
  runId: string;
  status: "succeeded" | "failed";
  counts: IngestionCounts;
  durationMs: number;
  error?: string | undefined;
}): Promise<void> => {
  await getDb()
    .update(ingestionRuns)
    .set({
      status: args.status,
      counts: args.counts,
      durationMs: args.durationMs,
      finishedAt: new Date(),
      error: args.error?.slice(0, 2000) ?? null,
    })
    .where(eq(ingestionRuns.id, args.runId));
};

export interface SearchLogEntry {
  userId: string | null;
  source: SearchSource;
  query: string;
  rewrittenQuery: string | null;
  resultCount: number;
  topScore: number | null;
  latencyMs: number;
  abstained: boolean | null;
}

export const insertSearchQuery = async (entry: SearchLogEntry): Promise<void> => {
  await getDb().insert(searchQueries).values(entry);
};
