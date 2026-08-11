import { CHUNKING } from "../config";
import { estimateTokens } from "./tokens";

export interface Chunk {
  ordinal: number;
  /** Heading breadcrumb above this chunk, outermost first. */
  headingPath: string[];
  /** Body text only. Citation offsets index into this string. */
  content: string;
  tokenCount: number;
}

interface Section {
  headingPath: string[];
  body: string;
  tokens: number;
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

/**
 * Splits Markdown into sections at ATX headings, carrying the heading
 * breadcrumb down. Fenced code blocks are respected so a `#` comment inside a
 * fence is never mistaken for a heading.
 */
const splitIntoSections = (markdown: string): Section[] => {
  const lines = markdown.split("\n");
  const sections: Section[] = [];

  let headingStack: string[] = [];
  let currentPath: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = (): void => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (body.length === 0) return;
    sections.push({
      headingPath: [...currentPath],
      body,
      tokens: estimateTokens(body),
    });
  };

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      buffer.push(line);
      continue;
    }

    const match = inFence ? null : HEADING_RE.exec(line);
    if (match?.[1] && match[2]) {
      flush();
      const depth = match[1].length;
      const title = match[2].trim();
      headingStack = headingStack.slice(0, depth - 1);
      headingStack[depth - 1] = title;
      currentPath = headingStack.filter((h): h is string => Boolean(h));
      continue;
    }

    buffer.push(line);
  }

  flush();
  return sections;
};

/** Trailing text of `body` worth about `tokens` tokens, cut at a sentence or line break. */
const tailOverlap = (body: string, tokens: number): string => {
  const approxChars = tokens * 4;
  if (body.length <= approxChars) return body;

  const tail = body.slice(body.length - approxChars);
  const cut = tail.search(/(?<=[.!?])\s|\n/);
  return (cut === -1 ? tail : tail.slice(cut + 1)).trim();
};

/** Splits one oversized section on paragraph boundaries. */
const splitOversized = (section: Section): Section[] => {
  const paragraphs = section.body.split(/\n{2,}/);
  const parts: Section[] = [];
  let buffer: string[] = [];

  const flush = (): void => {
    const body = buffer.join("\n\n").trim();
    buffer = [];
    if (body.length > 0) {
      parts.push({
        headingPath: section.headingPath,
        body,
        tokens: estimateTokens(body),
      });
    }
  };

  for (const paragraph of paragraphs) {
    const candidate = [...buffer, paragraph].join("\n\n");
    if (buffer.length > 0 && estimateTokens(candidate) > CHUNKING.maxTokens) {
      flush();
    }
    buffer.push(paragraph);
  }
  flush();

  return parts.length > 0 ? parts : [section];
};

/** Joins two adjacent sections, keeping the shallower breadcrumb — it describes the whole. */
const mergeSections = (a: Section, b: Section): Section => {
  const body = `${a.body}\n\n${b.body}`;
  return {
    headingPath: a.headingPath.length <= b.headingPath.length ? a.headingPath : b.headingPath,
    body,
    tokens: estimateTokens(body),
  };
};

/**
 * Chunks a Markdown document.
 *
 * Sections accumulate toward `targetTokens`, small sections merge forward
 * rather than being stranded alone, and oversized sections split on paragraph
 * boundaries. Consecutive chunks within a document overlap by `overlapTokens`
 * so a sentence spanning a boundary is still retrievable.
 *
 * On this corpus most documents produce exactly one chunk, which is correct:
 * these files are already at the granularity a retriever wants, and splitting a
 * 500-byte document destroys the context that makes it findable.
 */
export const chunkMarkdown = (markdown: string): Chunk[] => {
  const sections = splitIntoSections(markdown).flatMap((section) =>
    section.tokens > CHUNKING.maxTokens ? splitOversized(section) : [section],
  );

  if (sections.length === 0) return [];

  const chunks: Chunk[] = [];
  let pending: Section | null = null;

  const emit = (section: Section): void => {
    const previous = chunks.at(-1);
    const overlap =
      previous && CHUNKING.overlapTokens > 0
        ? tailOverlap(previous.content, CHUNKING.overlapTokens)
        : "";

    const content = overlap.length > 0 ? `${overlap}\n\n${section.body}` : section.body;

    chunks.push({
      ordinal: chunks.length,
      headingPath: section.headingPath,
      content,
      tokenCount: estimateTokens(content),
    });
  };

  for (const section of sections) {
    const current: Section | null = pending;
    if (!current) {
      pending = section;
      continue;
    }

    const candidate = mergeSections(current, section);

    // Merge while the result still fits, or while the pending section is too
    // small to stand on its own.
    const shouldMerge =
      candidate.tokens <= CHUNKING.targetTokens || current.tokens < CHUNKING.minSectionTokens;

    if (shouldMerge && candidate.tokens <= CHUNKING.maxTokens) {
      pending = candidate;
      continue;
    }

    emit(current);
    pending = section;
  }

  if (pending) emit(pending);

  return chunks;
};

/**
 * Text actually sent to the embedding model: the heading breadcrumb prepended
 * to the body.
 *
 * Stored separately from `content` because citations must quote only the body —
 * a citation pointing at a breadcrumb we synthesized would not exist in the
 * source document.
 */
export const embeddingText = (chunk: Pick<Chunk, "headingPath" | "content">): string =>
  chunk.headingPath.length > 0
    ? `${chunk.headingPath.join(" > ")}\n\n${chunk.content}`
    : chunk.content;
