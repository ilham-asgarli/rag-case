import { type ChatEvent, chatRequestSchema } from "@rag/contracts";
import { answerQuestion, logSearch, search } from "@rag/core";
import { parseBody, rateLimit, toErrorResponse } from "@/server/api";
import { requireSession } from "@/server/guards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const encoder = new TextEncoder();
const encode = (event: ChatEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

/**
 * Streams a grounded answer as server-sent events.
 *
 * Event order is fixed: one `sources`, then interleaved `delta` and `citation`,
 * then one terminal `done` or `error`. Sources are sent first so the UI can
 * render the passages it is about to cite while the answer is still streaming.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requireSession();
    rateLimit(`chat:${session.user.id}`, 20, 60_000);

    const { question, history } = await parseBody(request, chatRequestSchema);
    const startedAt = Date.now();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ChatEvent): void => {
          controller.enqueue(encode(event));
        };

        try {
          const retrieval = await search({ query: question, history });
          send({
            type: "sources",
            sources: retrieval.results,
            rewrittenQuery: retrieval.rewrittenQuery,
            retrievalMs: retrieval.latencyMs,
          });

          let abstained = true;
          let citationCount = 0;

          for await (const event of answerQuestion(question, retrieval.results)) {
            if (event.type === "delta") {
              send({ type: "delta", text: event.text });
            } else if (event.type === "citation") {
              send({ type: "citation", citation: event.citation });
            } else {
              abstained = event.abstained;
              citationCount = event.citationCount;
            }
          }

          const totalMs = Date.now() - startedAt;
          send({ type: "done", abstained, citationCount, totalMs });

          await logSearch({
            userId: session.user.id,
            source: "chat",
            query: question,
            rewrittenQuery: retrieval.rewrittenQuery,
            resultCount: retrieval.results.length,
            topScore: retrieval.results[0]?.scores.rerank ?? null,
            latencyMs: totalMs,
            abstained,
          });
        } catch (error) {
          // Once the stream is open the status code is already sent, so a
          // failure has to be reported inside the stream rather than as a
          // 500 the client would never see.
          console.error("Chat stream failed:", error);
          send({
            type: "error",
            code: "provider_error",
            message: "The answer could not be generated. Please try again.",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        // Stops proxies (and Next's own dev server) buffering the stream.
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
