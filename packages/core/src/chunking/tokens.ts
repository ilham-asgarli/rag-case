/**
 * Approximate token count.
 *
 * Deliberately a heuristic, not a real tokenizer. Chunk sizing only needs to be
 * roughly right — a chunk of 580 versus 600 tokens changes nothing about
 * retrieval quality — and pulling in a tokenizer to compute a number we then
 * round anyway would add a dependency and a WASM load for false precision.
 *
 * Calibrated for English prose and Markdown: ~4 characters per token, with a
 * floor from word count so heavily-punctuated text is not underestimated.
 */
export const estimateTokens = (text: string): number => {
  if (text.length === 0) return 0;
  const byChars = text.length / 4;
  const byWords = text.trim().split(/\s+/).length * 0.75;
  return Math.max(1, Math.round(Math.max(byChars, byWords)));
};
