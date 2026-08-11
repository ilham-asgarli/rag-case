"use client";

import type { Citation, RetrievedChunk } from "@rag/contracts";
import { Badge, Card } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Renders chunk text with the cited spans highlighted.
 *
 * The offsets come from the Anthropic Citations API and index into the exact
 * string that was sent to the model, so this needs no fuzzy matching — it
 * slices. Spans are sorted and merged first because two citations can overlap
 * when consecutive claims lean on the same sentence.
 */
const Highlighted = ({ text, citations }: { text: string; citations: Citation[] }) => {
  if (citations.length === 0) return <>{text}</>;

  const merged: Array<[number, number]> = [];
  for (const { startCharIndex, endCharIndex } of [...citations].sort(
    (a, b) => a.startCharIndex - b.startCharIndex,
  )) {
    const last = merged.at(-1);
    if (last && startCharIndex <= last[1]) {
      last[1] = Math.max(last[1], endCharIndex);
    } else {
      merged.push([startCharIndex, endCharIndex]);
    }
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  merged.forEach(([start, end], i) => {
    const from = Math.max(0, Math.min(start, text.length));
    const to = Math.max(from, Math.min(end, text.length));
    if (from > cursor) parts.push(text.slice(cursor, from));
    parts.push(
      <mark key={`${from}-${to}-${i}`} className="cite-highlight">
        {text.slice(from, to)}
      </mark>,
    );
    cursor = to;
  });

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
};

export const SourceCard = ({
  chunk,
  citations,
  index,
  active,
  onHover,
}: {
  chunk: RetrievedChunk;
  citations: Citation[];
  index: number;
  active: boolean;
  onHover: (chunkId: string | null) => void;
}) => {
  const cited = citations.length > 0;

  return (
    <Card
      id={`source-${chunk.chunkId}`}
      onMouseEnter={() => onHover(chunk.chunkId)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "scroll-mt-4 p-4 transition-colors",
        active && "border-accent ring-1 ring-accent",
        !cited && "opacity-75",
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-subtle">[{index + 1}]</span>
            <h3 className="truncate font-medium text-ink text-sm">{chunk.title}</h3>
          </div>
          <p className="mt-0.5 truncate font-mono text-ink-subtle text-xs">{chunk.path}</p>
          {chunk.headingPath.length > 0 && (
            <p className="mt-0.5 truncate text-ink-subtle text-xs">
              {chunk.headingPath.join(" › ")}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {cited ? <Badge tone="accent">cited</Badge> : <Badge>retrieved</Badge>}
        </div>
      </div>

      <p className="whitespace-pre-wrap text-ink-muted text-sm leading-relaxed">
        <Highlighted text={chunk.content} citations={citations} />
      </p>

      {/* Showing every score is how a reader can tell *why* a passage ranked. */}
      <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-border border-t pt-2 text-xs">
        <div className="flex gap-1">
          <dt className="text-ink-subtle">rerank</dt>
          <dd className="font-mono text-ink-muted">{chunk.scores.rerank?.toFixed(3) ?? "—"}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-ink-subtle">rrf</dt>
          <dd className="font-mono text-ink-muted">{chunk.scores.rrf.toFixed(4)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-ink-subtle">vector</dt>
          <dd className="font-mono text-ink-muted">{chunk.scores.vectorRank ?? "—"}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-ink-subtle">keyword</dt>
          <dd className="font-mono text-ink-muted">{chunk.scores.lexicalRank ?? "—"}</dd>
        </div>
      </dl>
    </Card>
  );
};
