"use client";

import {
  type ChatEvent,
  type Citation,
  chatEventSchema,
  type RetrievedChunk,
} from "@rag/contracts";
import { useCallback, useRef, useState } from "react";

export interface Turn {
  question: string;
  answer: string;
  sources: RetrievedChunk[];
  citations: Citation[];
  rewrittenQuery: string | null;
  retrievalMs: number | null;
  totalMs: number | null;
  abstained: boolean;
  error: string | null;
  streaming: boolean;
}

const emptyTurn = (question: string): Turn => ({
  question,
  answer: "",
  sources: [],
  citations: [],
  rewrittenQuery: null,
  retrievalMs: null,
  totalMs: null,
  abstained: false,
  error: null,
  streaming: true,
});

/**
 * Consumes the chat SSE stream.
 *
 * Written directly against `fetch` rather than using the Vercel AI SDK: this UI
 * is built around per-citation character offsets, which that SDK's message
 * format does not surface. The whole reader is ~60 lines and every event is
 * validated by the same Zod schema the server encodes with, so the two cannot
 * drift apart.
 */
export const useGroundedChat = () => {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const updateLast = useCallback((patch: (turn: Turn) => Turn) => {
    setTurns((current) => {
      if (current.length === 0) return current;
      const next = [...current];
      const last = next[next.length - 1];
      if (last) next[next.length - 1] = patch(last);
      return next;
    });
  }, []);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (trimmed.length === 0 || pending) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Only completed turns become history, so a half-streamed answer is
      // never fed back into the query rewriter.
      const history = turns
        .filter((turn) => !turn.streaming && turn.answer.length > 0)
        .flatMap((turn) => [
          { role: "user" as const, content: turn.question },
          { role: "assistant" as const, content: turn.answer },
        ])
        .slice(-8);

      setTurns((current) => [...current, emptyTurn(trimmed)]);
      setPending(true);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed, history }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const problem = await response.json().catch(() => null);
          const message =
            (problem as { error?: { message?: string } } | null)?.error?.message ??
            "The request failed.";
          updateLast((turn) => ({ ...turn, error: message, streaming: false }));
          return;
        }

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += value;
          // SSE frames are separated by a blank line; the tail may be partial.
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;

            const parsed = chatEventSchema.safeParse(JSON.parse(line.slice(6)));
            if (!parsed.success) continue;

            applyEvent(parsed.data, updateLast);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        updateLast((turn) => ({
          ...turn,
          error: error instanceof Error ? error.message : "The request failed.",
          streaming: false,
        }));
      } finally {
        setPending(false);
        updateLast((turn) => ({ ...turn, streaming: false }));
      }
    },
    [pending, turns, updateLast],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setTurns([]);
    setPending(false);
  }, []);

  return { turns, pending, ask, reset };
};

const applyEvent = (event: ChatEvent, updateLast: (patch: (turn: Turn) => Turn) => void): void => {
  switch (event.type) {
    case "sources":
      updateLast((turn) => ({
        ...turn,
        sources: event.sources,
        rewrittenQuery: event.rewrittenQuery,
        retrievalMs: event.retrievalMs,
      }));
      break;
    case "delta":
      updateLast((turn) => ({ ...turn, answer: turn.answer + event.text }));
      break;
    case "citation":
      updateLast((turn) => ({ ...turn, citations: [...turn.citations, event.citation] }));
      break;
    case "done":
      updateLast((turn) => ({
        ...turn,
        abstained: event.abstained,
        totalMs: event.totalMs,
        streaming: false,
      }));
      break;
    case "error":
      updateLast((turn) => ({ ...turn, error: event.message, streaming: false }));
      break;
  }
};
