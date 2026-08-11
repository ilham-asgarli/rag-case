import { type SearchResponse, searchRequestSchema } from "@rag/contracts";
import { logSearch, search } from "@rag/core";
import { NextResponse } from "next/server";
import { parseBody, rateLimit, toErrorResponse } from "@/server/api";
import { requireSession } from "@/server/guards";

export const dynamic = "force-dynamic";

/** Retrieval without answer generation — used by the dashboard and for debugging ranking. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    rateLimit(`search:${session.user.id}`, 40, 60_000);

    const { query, limit, docType } = await parseBody(request, searchRequestSchema);
    const outcome = await search({ query, limit, docType });

    await logSearch({
      userId: session.user.id,
      source: "search",
      query,
      rewrittenQuery: outcome.rewrittenQuery,
      resultCount: outcome.results.length,
      topScore: outcome.results[0]?.scores.rerank ?? null,
      latencyMs: outcome.latencyMs,
    });

    return NextResponse.json<SearchResponse>({
      results: outcome.results,
      rewrittenQuery: outcome.rewrittenQuery,
      latencyMs: outcome.latencyMs,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
