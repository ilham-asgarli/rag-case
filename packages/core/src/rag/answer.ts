import type Anthropic from "@anthropic-ai/sdk";
import type { Citation, RetrievedChunk } from "@rag/contracts";
import { ANSWER, MODELS } from "../config.js";
import { getAnthropic } from "../providers/anthropic.js";
import { ANSWER_SYSTEM_PROMPT, formatDocumentContext } from "./prompt.js";

export type AnswerEvent =
  | { type: "delta"; text: string }
  | { type: "citation"; citation: Citation }
  | { type: "done"; abstained: boolean; citationCount: number };

/**
 * Builds the user turn: one `document` block per retrieved chunk, then the
 * question.
 *
 * Document order is load-bearing. A citation's `document_index` indexes this
 * array, so `sources[i]` must stay aligned with block `i` — if the two ever
 * diverge, every citation silently points at the wrong source.
 */
const buildContent = (
  question: string,
  sources: RetrievedChunk[],
): Anthropic.Messages.ContentBlockParam[] => [
  ...sources.map(
    (chunk): Anthropic.Messages.ContentBlockParam => ({
      type: "document",
      source: {
        type: "text",
        media_type: "text/plain",
        // Sent byte-for-byte as stored: citation offsets index into this exact
        // string, so trimming or re-wrapping here would misplace highlights.
        data: chunk.content,
      },
      title: chunk.title,
      context: formatDocumentContext({
        path: chunk.path,
        headingPath: chunk.headingPath,
        docType: chunk.docType,
        docDate: chunk.docDate,
      }),
      citations: { enabled: true },
    }),
  ),
  { type: "text", text: question },
];

interface RawCitation {
  type: string;
  document_index?: number;
  cited_text?: string;
  start_char_index?: number;
  end_char_index?: number;
}

/** Maps an API citation back onto the chunk it came from. */
const toCitation = (raw: RawCitation, sources: RetrievedChunk[]): Citation | null => {
  const index = raw.document_index;
  if (typeof index !== "number") return null;

  const chunk = sources[index];
  if (!chunk) return null;

  return {
    chunkId: chunk.chunkId,
    documentId: chunk.documentId,
    path: chunk.path,
    title: chunk.title,
    citedText: raw.cited_text ?? "",
    startCharIndex: raw.start_char_index ?? 0,
    endCharIndex: raw.end_char_index ?? raw.cited_text?.length ?? 0,
  };
};

/**
 * Streams a grounded answer.
 *
 * Abstention is measured, not parsed: if the model emits no citations at all,
 * nothing it said was traceable to a source, so the answer is flagged
 * `abstained` regardless of how confident the prose sounds. That check lives
 * here in the transport rather than in the prompt, because a prompt cannot
 * enforce itself.
 *
 * Note: citations and `output_config.format` are mutually exclusive in the
 * API — enabling both returns 400 — which is why the answer is prose plus
 * citation blocks rather than structured output.
 */
export async function* answerQuestion(
  question: string,
  sources: RetrievedChunk[],
): AsyncGenerator<AnswerEvent> {
  if (sources.length === 0) {
    yield {
      type: "delta",
      text: "I could not find anything in this corpus that addresses that question.",
    };
    yield { type: "done", abstained: true, citationCount: 0 };
    return;
  }

  const stream = getAnthropic().messages.stream({
    model: MODELS.answer,
    max_tokens: ANSWER.maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: ANSWER.effort },
    system: ANSWER_SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildContent(question, sources) }],
  });

  let citationCount = 0;
  const seen = new Set<string>();

  for await (const event of stream) {
    if (event.type !== "content_block_delta") continue;

    const delta = event.delta;

    if (delta.type === "text_delta") {
      yield { type: "delta", text: delta.text };
      continue;
    }

    if (delta.type === "citations_delta") {
      const citation = toCitation(delta.citation as RawCitation, sources);
      if (!citation) continue;

      // The same sentence can support several consecutive claims; de-duplicate
      // so the UI shows each distinct supporting quote once.
      const key = `${citation.chunkId}:${citation.startCharIndex}:${citation.endCharIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);

      citationCount++;
      yield { type: "citation", citation };
    }
  }

  yield { type: "done", abstained: citationCount === 0, citationCount };
}
