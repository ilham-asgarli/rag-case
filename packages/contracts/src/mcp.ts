import { z } from "zod";
import { docTypeSchema } from "./common.js";

/**
 * MCP tool input schemas.
 *
 * These are the same Zod objects the MCP server registers as tool schemas, so
 * the contract an external client sees and the contract the handler validates
 * cannot drift apart. Descriptions are written for a model to read: they say
 * *when* to call the tool, not just what it does.
 */

export const searchCorpusInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe("Natural-language question or keywords to search the corpus for."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(6)
    .describe("How many passages to return. Defaults to 6."),
  docType: docTypeSchema
    .optional()
    .describe("Restrict results to one category of document. Omit to search everything."),
});
export type SearchCorpusInput = z.infer<typeof searchCorpusInputSchema>;

export const getDocumentInputSchema = z.object({
  path: z
    .string()
    .trim()
    .min(1)
    .max(400)
    .describe(
      "Corpus-relative path of the document, as returned in a search_corpus result (for example 'sdk-notes-v3.md').",
    ),
});
export type GetDocumentInput = z.infer<typeof getDocumentInputSchema>;

/** Scope an access token must carry to call the search tools. */
export const MCP_SEARCH_SCOPE = "corpus:search";
