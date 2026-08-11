import { dashboardStatsSchema } from "@rag/contracts";
import { MODELS } from "@rag/core";
import { getIndexHealth, getSearchStats, listIngestionRuns } from "@rag/db";
import { NextResponse } from "next/server";
import { toErrorResponse } from "@/server/api";
import { requireAdmin } from "@/server/guards";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await requireAdmin();
    const [health, search, runs] = await Promise.all([
      getIndexHealth(),
      getSearchStats(),
      listIngestionRuns(10),
    ]);

    // Parsing on the way out keeps the response honest: a query that silently changes shape or
    // type fails here rather than reaching the dashboard as malformed JSON.
    return NextResponse.json(
      dashboardStatsSchema.parse({
        index: {
          ...health,
          embeddingModel: MODELS.embedding,
          embeddingDimensions: MODELS.embeddingDimensions,
          rerankModel: MODELS.rerank,
          answerModel: MODELS.answer,
          vectorIndex: "HNSW (cosine)",
        },
        search,
        runs,
      }),
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
