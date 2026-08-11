"use client";

import type { Citation } from "@rag/contracts";
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Input } from "@/components/ui";
import { SourceCard } from "./source-card";
import { type Turn, useGroundedChat } from "./use-grounded-chat";

const EXAMPLES = [
  "What is the maximum file size for an AppLovin playable, and how does it ship?",
  "How do I initialize the current Lumen SDK, and what happened to lumen.track?",
  "Why are sound assets built in a separate pass?",
  "Which languages must every playable ship with, and what is the fallback?",
];

const groupCitations = (citations: Citation[]): Map<string, Citation[]> => {
  const byChunk = new Map<string, Citation[]>();
  for (const citation of citations) {
    const list = byChunk.get(citation.chunkId) ?? [];
    list.push(citation);
    byChunk.set(citation.chunkId, list);
  }
  return byChunk;
};

const AnswerBody = ({
  turn,
  citedOrder,
  onHover,
}: {
  turn: Turn;
  citedOrder: Map<string, number>;
  onHover: (chunkId: string | null) => void;
}) => {
  if (turn.error) {
    return (
      <div className="rounded-lg border border-critical/30 bg-critical-soft px-3 py-2 text-critical text-sm">
        {turn.error}
      </div>
    );
  }

  // A completed answer with no citations is not an answer — it is an honest
  // "not in the corpus". Rendering it as a distinct state is the point: the
  // user can tell honesty from failure at a glance.
  if (!turn.streaming && turn.abstained) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3">
        <p className="font-medium text-sm text-warning">Not covered by this corpus</p>
        <p className="mt-1 text-ink-muted text-sm">{turn.answer}</p>
        <p className="mt-2 text-ink-subtle text-xs">
          No supporting passage was found, so nothing has been cited rather than guessed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="whitespace-pre-wrap text-ink leading-relaxed">
        {turn.answer}
        {turn.streaming && (
          <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-accent align-text-bottom" />
        )}
      </p>

      {turn.citations.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-ink-subtle text-xs">Sources:</span>
          {[...new Set(turn.citations.map((c) => c.chunkId))].map((chunkId) => {
            const index = citedOrder.get(chunkId);
            const citation = turn.citations.find((c) => c.chunkId === chunkId);
            if (index === undefined || !citation) return null;
            return (
              <button
                key={chunkId}
                type="button"
                onMouseEnter={() => onHover(chunkId)}
                onMouseLeave={() => onHover(null)}
                onClick={() => {
                  document
                    .getElementById(`source-${chunkId}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                title={citation.citedText}
                className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-accent-ink text-xs hover:bg-accent hover:text-white"
              >
                [{index + 1}] {citation.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ChatView = () => {
  const { turns, pending, ask, reset } = useGroundedChat();
  const [draft, setDraft] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);

  const latest = turns.at(-1);
  const citationsByChunk = useMemo(
    () => groupCitations(latest?.citations ?? []),
    [latest?.citations],
  );
  const citedOrder = useMemo(
    () => new Map((latest?.sources ?? []).map((source, i) => [source.chunkId, i])),
    [latest?.sources],
  );

  const submit = (question: string) => {
    setDraft("");
    void ask(question);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-4">
        {turns.length === 0 ? (
          <Card>
            <EmptyState
              title="Ask the Lumen documentation"
              description="Answers are generated only from the indexed corpus, and every claim links to the passage that supports it."
            />
            <div className="grid gap-2 px-6 pb-6">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => submit(example)}
                  className="rounded-lg border border-border px-3 py-2 text-left text-ink-muted text-sm hover:border-accent hover:text-ink"
                >
                  {example}
                </button>
              ))}
            </div>
          </Card>
        ) : (
          turns.map((turn, i) => (
            <Card key={`${turn.question}-${i}`} className="p-5">
              <p className="mb-3 font-medium text-ink">{turn.question}</p>
              {turn.rewrittenQuery && (
                <p className="mb-3 text-ink-subtle text-xs">
                  Searched for: <span className="font-mono">{turn.rewrittenQuery}</span>
                </p>
              )}
              <AnswerBody turn={turn} citedOrder={citedOrder} onHover={setHovered} />
              {!turn.streaming && turn.totalMs !== null && (
                <p className="mt-3 text-ink-subtle text-xs">
                  {turn.sources.length} passages retrieved in {turn.retrievalMs} ms · answered in{" "}
                  {turn.totalMs} ms
                </p>
              )}
            </Card>
          ))
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
          className="sticky bottom-0 flex gap-2 bg-surface py-2"
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about the corpus…"
            aria-label="Your question"
            disabled={pending}
          />
          <Button type="submit" disabled={pending || draft.trim().length === 0}>
            {pending ? "Thinking…" : "Ask"}
          </Button>
          {turns.length > 0 && (
            <Button type="button" variant="ghost" onClick={reset}>
              Clear
            </Button>
          )}
        </form>
      </div>

      {/* Desktop: a second column. Mobile: it simply flows underneath. */}
      <aside className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-ink text-sm">Retrieved passages</h2>
          {latest && latest.sources.length > 0 && (
            <Badge>{latest.sources.length} of the corpus</Badge>
          )}
        </div>

        {!latest || latest.sources.length === 0 ? (
          <Card className="p-4">
            <p className="text-ink-subtle text-sm">
              Passages appear here as soon as retrieval finishes, before the answer streams in.
            </p>
          </Card>
        ) : (
          latest.sources.map((chunk, i) => (
            <SourceCard
              key={chunk.chunkId}
              chunk={chunk}
              index={i}
              citations={citationsByChunk.get(chunk.chunkId) ?? []}
              active={hovered === chunk.chunkId}
              onHover={setHovered}
            />
          ))
        )}
      </aside>
    </div>
  );
};
