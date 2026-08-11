import type { DocType, RetrievedChunk, SearchSource } from "@rag/contracts";
import { type CandidateRow, fetchHybridCandidates, insertSearchQuery } from "@rag/db";
import { RETRIEVAL } from "../config.js";
import { embedOne, rerank } from "../providers/voyage.js";
import { rewriteQuery } from "./rewrite.js";

export interface SearchOptions {
  query: string;
  limit?: number | undefined;
  docType?: DocType | undefined;
  /** Prior turns. When present, the query is rewritten to stand alone. */
  history?: Array<{ role: "user" | "assistant"; content: string }> | undefined;
}

export interface SearchOutcome {
  results: RetrievedChunk[];
  rewrittenQuery: string | null;
  latencyMs: number;
}

const toRetrievedChunk = (row: CandidateRow, rerankScore: number | null): RetrievedChunk => ({
  chunkId: row.chunk_id,
  documentId: row.document_id,
  path: row.path,
  title: row.title,
  docType: row.doc_type,
  docDate: row.doc_date ? new Date(row.doc_date).toISOString() : null,
  headingPath: row.heading_path ?? [],
  ordinal: Number(row.ordinal),
  content: row.content,
  scores: {
    vectorRank: row.vector_rank === null ? null : Number(row.vector_rank),
    lexicalRank: row.lexical_rank === null ? null : Number(row.lexical_rank),
    rrf: Number(row.rrf),
    rerank: rerankScore,
  },
});

/**
 * Retrieves the passages most likely to answer `query`.
 *
 * Rewrite (only with history) -> embed -> hybrid candidates + RRF -> rerank.
 *
 * The reranker is what separates near-identical documents. On this corpus 115
 * delivery reports and meeting notes share a template, so neither dense nor
 * lexical similarity alone can tell March's Waffle Rush report from March's
 * Tidal Tycoon one.
 */
export const search = async (options: SearchOptions): Promise<SearchOutcome> => {
  const startedAt = Date.now();
  const limit = options.limit ?? RETRIEVAL.defaultLimit;

  const rewritten =
    options.history && options.history.length > 0
      ? await rewriteQuery(options.query, options.history)
      : null;

  const effectiveQuery = rewritten ?? options.query;
  const queryVector = await embedOne(effectiveQuery, "query");

  const candidates = await fetchHybridCandidates({
    queryText: effectiveQuery,
    queryVector,
    docType: options.docType,
    perArm: RETRIEVAL.candidatesPerArm,
    rrfK: RETRIEVAL.rrfK,
    limit: RETRIEVAL.rerankCandidates,
  });

  if (candidates.length === 0) {
    return { results: [], rewrittenQuery: rewritten, latencyMs: Date.now() - startedAt };
  }

  const ranked = await rerank(
    effectiveQuery,
    candidates.map((row) => row.content),
    limit,
  );

  const results = ranked
    .filter((entry) => entry.score >= RETRIEVAL.minRerankScore)
    .map((entry) => {
      const row = candidates[entry.index];
      return row ? toRetrievedChunk(row, entry.score) : null;
    })
    .filter((chunk): chunk is RetrievedChunk => chunk !== null);

  return { results, rewrittenQuery: rewritten, latencyMs: Date.now() - startedAt };
};

/** Records a search for the dashboard's analytics. Never fails the request it describes. */
export const logSearch = async (entry: {
  userId?: string | undefined;
  source: SearchSource;
  query: string;
  rewrittenQuery: string | null;
  resultCount: number;
  topScore: number | null;
  latencyMs: number;
  abstained?: boolean | undefined;
}): Promise<void> => {
  try {
    await insertSearchQuery({
      userId: entry.userId ?? null,
      source: entry.source,
      query: entry.query,
      rewrittenQuery: entry.rewrittenQuery,
      resultCount: entry.resultCount,
      topScore: entry.topScore,
      latencyMs: entry.latencyMs,
      abstained: entry.abstained ?? null,
    });
  } catch (error) {
    console.warn("Failed to log search:", error);
  }
};
