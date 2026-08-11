import { z } from "zod";
import { docTypeSchema } from "./common.js";

/**
 * Every score that contributed to a chunk's position, carried through to the
 * UI and the dashboard so a result can explain *why* it ranked. A rank is null
 * when that arm did not return the chunk at all — which is meaningful: a chunk
 * found only lexically and a chunk found by both are different signals.
 */
export const retrievalScoresSchema = z.object({
  vectorRank: z.number().int().positive().nullable(),
  lexicalRank: z.number().int().positive().nullable(),
  rrf: z.number(),
  rerank: z.number().nullable(),
});
export type RetrievalScores = z.infer<typeof retrievalScoresSchema>;

export const retrievedChunkSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  /** POSIX-style, relative to the corpus root, on every platform. */
  path: z.string(),
  title: z.string(),
  docType: docTypeSchema,
  /** ISO date parsed from the filename, when the document carries one. */
  docDate: z.string().nullable(),
  headingPath: z.array(z.string()),
  ordinal: z.number().int().nonnegative(),
  /**
   * The chunk body, byte-for-byte as it is sent to the model. Citation offsets
   * index into this exact string, so it must not be trimmed or re-wrapped
   * anywhere between retrieval and rendering.
   */
  content: z.string(),
  scores: retrievalScoresSchema,
});
export type RetrievedChunk = z.infer<typeof retrievedChunkSchema>;

export const searchRequestSchema = z.object({
  query: z.string().trim().min(1, "Query must not be empty").max(500),
  limit: z.number().int().min(1).max(20).default(6),
  docType: docTypeSchema.optional(),
});
export type SearchRequest = z.infer<typeof searchRequestSchema>;

export const searchResponseSchema = z.object({
  results: z.array(retrievedChunkSchema),
  /** Non-null only when the query rewriter ran and changed the query. */
  rewrittenQuery: z.string().nullable(),
  latencyMs: z.number().int().nonnegative(),
});
export type SearchResponse = z.infer<typeof searchResponseSchema>;
