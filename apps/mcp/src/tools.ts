import { McpServer } from "@modelcontextprotocol/server";
import { getDocumentInputSchema, searchCorpusInputSchema } from "@rag/contracts";
import { logSearch, search } from "@rag/core";
import { getDocumentByPath } from "@rag/db";

/**
 * Builds an MCP server exposing corpus search.
 *
 * A fresh instance is created per request: the HTTP transport is stateless, so
 * there is no cross-request state to leak between callers, and the caller's
 * identity can be closed over for analytics.
 */
export const createServer = (userId: string): McpServer => {
  const server = new McpServer({ name: "lumen-corpus", version: "1.0.0" });

  server.registerTool(
    "search_corpus",
    {
      title: "Search the Lumen documentation corpus",
      description:
        "Search the Lumen Playables documentation and return the most relevant passages. " +
        "Use this whenever a question concerns Lumen's SDK, build pipeline, network specs, " +
        "delivery reports, meeting notes, or internal process. Returns passages with their " +
        "source path and relevance scores; it does not return a written answer.",
      inputSchema: searchCorpusInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ query, limit, docType }) => {
      const outcome = await search({ query, limit, docType });

      await logSearch({
        userId,
        source: "mcp",
        query,
        rewrittenQuery: outcome.rewrittenQuery,
        resultCount: outcome.results.length,
        topScore: outcome.results[0]?.scores.rerank ?? null,
        latencyMs: outcome.latencyMs,
      });

      if (outcome.results.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No passages in the corpus matched "${query}".`,
            },
          ],
        };
      }

      const rendered = outcome.results
        .map((chunk, i) => {
          const section = chunk.headingPath.length > 0 ? ` › ${chunk.headingPath.join(" › ")}` : "";
          const score = chunk.scores.rerank?.toFixed(3) ?? "n/a";
          return [
            `[${i + 1}] ${chunk.title}${section}`,
            `path: ${chunk.path}  (relevance ${score})`,
            "",
            chunk.content,
          ].join("\n");
        })
        .join("\n\n---\n\n");

      return { content: [{ type: "text" as const, text: rendered }] };
    },
  );

  server.registerTool(
    "get_document",
    {
      title: "Read a full corpus document",
      description:
        "Return the complete text of one corpus document by its path, as returned in a " +
        "search_corpus result. Use this after searching when a passage is not enough and the " +
        "whole document is needed.",
      inputSchema: getDocumentInputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ path }) => {
      // Looked up by exact indexed path rather than read from disk, so a
      // caller-supplied string can never traverse the filesystem.
      const document = await getDocumentByPath(path);

      if (!document) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No indexed document at "${path}". Use search_corpus to find valid paths.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `# ${document.title}\npath: ${document.path}\n\n${document.content}`,
          },
        ],
      };
    },
  );

  return server;
};
