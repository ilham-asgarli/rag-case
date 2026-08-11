import { ingest } from "@rag/core";
import { listIngestionRuns, resolveFromRepoRoot } from "@rag/db";
import { NextResponse } from "next/server";
import { rateLimit, toErrorResponse } from "@/server/api";
import { requireAdmin } from "@/server/guards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    return NextResponse.json({ runs: await listIngestionRuns(20) });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Triggers a re-index from the dashboard.
 *
 * Runs inline and returns the counts. That is honest for this corpus — a full
 * pass over 142 documents takes seconds, and an incremental pass over an
 * unchanged corpus makes no provider calls at all. A larger corpus would want
 * a job queue, which the README notes rather than pretends to have.
 */
export async function POST(): Promise<Response> {
  try {
    const session = await requireAdmin();
    rateLimit(`ingest:${session.user.id}`, 3, 60_000);

    const result = await ingest({
      corpusDir: resolveFromRepoRoot(process.env.CORPUS_DIR ?? "./data/corpus"),
      trigger: "dashboard",
    });

    return NextResponse.json({
      runId: result.runId,
      counts: result.counts,
      durationMs: result.durationMs,
      failures: result.failures,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
