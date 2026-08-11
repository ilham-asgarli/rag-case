import { z } from "zod";
import { errorCodeSchema } from "./common.js";
import { retrievedChunkSchema } from "./search.js";

/**
 * One supporting quote behind one claim.
 *
 * `startCharIndex` / `endCharIndex` are offsets into the source chunk's
 * `content` exactly as it was sent to the model (end exclusive), which is what
 * lets the UI highlight the precise sentence rather than the whole passage.
 */
export const citationSchema = z.object({
  chunkId: z.string(),
  documentId: z.string(),
  path: z.string(),
  title: z.string(),
  citedText: z.string(),
  startCharIndex: z.number().int().nonnegative(),
  endCharIndex: z.number().int().nonnegative(),
});
export type Citation = z.infer<typeof citationSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  question: z.string().trim().min(1, "Question must not be empty").max(1000),
  /** Prior turns, used only to rewrite a follow-up into a standalone query. */
  history: z.array(chatMessageSchema).max(20).default([]),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * The server-sent event protocol for a grounded answer.
 *
 * Ordering is fixed: exactly one `sources`, then any number of `delta` and
 * `citation` events interleaved, then exactly one terminal `done` or `error`.
 * Sources arrive first so the UI can render the passages it is about to cite
 * while the answer is still streaming.
 */
export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("sources"),
    sources: z.array(retrievedChunkSchema),
    rewrittenQuery: z.string().nullable(),
    retrievalMs: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("citation"),
    citation: citationSchema,
  }),
  z.object({
    type: z.literal("done"),
    /**
     * True when the model produced no citations at all, which is how this
     * system detects an ungrounded answer. It is measured from the stream,
     * not inferred from the wording of the reply.
     */
    abstained: z.boolean(),
    citationCount: z.number().int().nonnegative(),
    totalMs: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("error"),
    code: errorCodeSchema,
    message: z.string(),
  }),
]);
export type ChatEvent = z.infer<typeof chatEventSchema>;
