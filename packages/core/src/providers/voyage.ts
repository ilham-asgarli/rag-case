import { EMBED_BATCH_SIZE, MODELS } from "../config";

/**
 * Minimal typed client for the two Voyage endpoints this project uses.
 *
 * Written against the REST API rather than the `voyageai` npm package: that
 * package is still 0.x, and this is ~80 lines with retries and exact types.
 * A thin dependency we control beats a thin dependency we don't.
 */

const VOYAGE_BASE_URL = "https://api.voyageai.com/v1";

export class ProviderError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

const getApiKey = (): string => {
  const key = process.env.VOYAGE_API_KEY;
  if (!key) {
    throw new ProviderError("VOYAGE_API_KEY is not set. Add it to .env.");
  }
  return key;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Retries only what is worth retrying: rate limits and server errors. A 400 is
 * a bug in our request and retrying it just delays the error.
 */
const request = async <T>(path: string, body: unknown, attempt = 0): Promise<T> => {
  const response = await fetch(`${VOYAGE_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (response.ok) {
    return (await response.json()) as T;
  }

  const retryable = response.status === 429 || response.status >= 500;
  if (retryable && attempt < 4) {
    await sleep(2 ** attempt * 500 + Math.random() * 250);
    return request<T>(path, body, attempt + 1);
  }

  const detail = await response.text().catch(() => "");
  throw new ProviderError(
    `Voyage ${path} failed with ${response.status}: ${detail.slice(0, 300)}`,
    response.status,
  );
};

interface EmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
}

/**
 * `inputType` is asymmetric on purpose: Voyage embeds a question and a passage
 * into different regions of the space. Passing "document" for a query silently
 * costs recall, with no error to notice.
 */
export const embed = async (
  texts: string[],
  inputType: "query" | "document",
): Promise<number[][]> => {
  if (texts.length === 0) return [];

  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const result = await request<EmbeddingResponse>("/embeddings", {
      input: batch,
      model: MODELS.embedding,
      input_type: inputType,
      output_dimension: MODELS.embeddingDimensions,
    });

    // The API documents index ordering but does not promise it; sorting makes
    // the mapping back onto `texts` explicit rather than assumed.
    const ordered = [...result.data].sort((a, b) => a.index - b.index);
    if (ordered.length !== batch.length) {
      throw new ProviderError(
        `Voyage returned ${ordered.length} embeddings for ${batch.length} inputs`,
      );
    }
    for (const item of ordered) out.push(item.embedding);
  }

  return out;
};

export const embedOne = async (
  text: string,
  inputType: "query" | "document",
): Promise<number[]> => {
  const [vector] = await embed([text], inputType);
  if (!vector) throw new ProviderError("Voyage returned no embedding");
  return vector;
};

interface RerankResponse {
  data: Array<{ index: number; relevance_score: number }>;
}

export interface RerankResult {
  /** Index into the `documents` array that was passed in. */
  index: number;
  score: number;
}

export const rerank = async (
  query: string,
  documents: string[],
  topK: number,
): Promise<RerankResult[]> => {
  if (documents.length === 0) return [];

  const result = await request<RerankResponse>("/rerank", {
    query,
    documents,
    model: MODELS.rerank,
    top_k: Math.min(topK, documents.length),
  });

  return result.data.map((item) => ({
    index: item.index,
    score: item.relevance_score,
  }));
};
