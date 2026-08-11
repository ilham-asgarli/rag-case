/**
 * Every tuning constant and model id in one place.
 *
 * These are pinned rather than configurable because changing one changes answer
 * quality, and a silently-different value between environments would make a
 * regression impossible to reproduce.
 */

export const MODELS = {
  /** Grounded answers. Citations are an Anthropic API feature, not prompt formatting. */
  answer: "claude-opus-5",
  /** Folding a follow-up plus history into a standalone search query. */
  rewrite: "claude-haiku-4-5",
  /** voyage-4 at its default output dimension. Must match the vector(n) column. */
  embedding: "voyage-4",
  embeddingDimensions: 1024,
  /** Reranking is the single biggest quality lever on a corpus of near-duplicates. */
  rerank: "rerank-2.5-lite",
} as const;

export const RETRIEVAL = {
  /** Candidates pulled from each arm before fusion. */
  candidatesPerArm: 40,
  /** Reciprocal Rank Fusion constant. 60 is the value from the original paper. */
  rrfK: 60,
  /** How many fused candidates get sent to the reranker. */
  rerankCandidates: 20,
  /** Default number of passages returned to a caller. */
  defaultLimit: 6,
  /**
   * Reranker scores below this are dropped. Set low deliberately: it exists to
   * cut obvious noise, not to make the abstention decision. Abstention is the
   * model's job, measured by whether it cites anything.
   */
  minRerankScore: 0.05,
} as const;

export const CHUNKING = {
  targetTokens: 600,
  maxTokens: 900,
  overlapTokens: 80,
  /** Sections smaller than this are merged forward rather than stranded alone. */
  minSectionTokens: 120,
} as const;

export const ANSWER = {
  maxTokens: 4096,
  /**
   * Opus 5 is unusually strong at low effort, and this is an interactive chat
   * surface where latency is part of the product.
   */
  effort: "low",
} as const;

/**
 * Inputs per embedding request.
 *
 * Voyage accepts up to 128, but a free-tier account without a payment method
 * is capped at 10K tokens per minute. Keeping batches modest means a single
 * request stays inside that cap, so ingestion succeeds (slowly) on a free key
 * rather than failing outright.
 */
export const EMBED_BATCH_SIZE = 32;

/**
 * Documents chunked and embedded together before being written.
 *
 * Embedding is batched across documents rather than per document — on a corpus
 * where each document yields one chunk, per-document embedding meant one API
 * round trip per document. The window bounds peak memory on a large corpus
 * while still collapsing hundreds of round trips into a handful.
 */
export const INGEST_WINDOW = 200;
