import type { IngestionCounts, IngestionTrigger } from "@rag/contracts";
import {
  deleteDocuments,
  finishIngestionRun,
  type IndexedDocumentRow,
  listIndexedDocuments,
  markDocumentFailed,
  replaceDocument,
  startIngestionRun,
} from "@rag/db";
import { type Chunk, chunkMarkdown, embeddingText } from "../chunking/markdown-chunker";
import { INGEST_WINDOW } from "../config";
import { embed } from "../providers/voyage";
import { planIngestion } from "./diff";
import { discoverDocuments, type SourceDocument } from "./discover";

export interface IngestOptions {
  corpusDir: string;
  trigger: IngestionTrigger;
  /** Re-embed everything, ignoring content hashes. Needed after a model change. */
  force?: boolean;
  onProgress?: (message: string) => void;
}

export interface IngestResult {
  runId: string;
  counts: IngestionCounts;
  durationMs: number;
  failures: Array<{ path: string; error: string }>;
}

interface PreparedDocument {
  source: SourceDocument;
  chunks: Chunk[];
}

/**
 * Embeds and persists a window of documents.
 *
 * Embedding is batched **across** documents, not per document. That matters
 * enormously on a corpus shaped like this one: 142 documents each produce a
 * single chunk, so embedding per document meant 142 sequential API round trips
 * — roughly eighteen minutes. Batching across documents turns the same work
 * into two requests.
 *
 * Documents are processed in windows so peak memory stays bounded however
 * large the corpus grows.
 */
const indexWindow = async (
  window: PreparedDocument[],
  newPaths: Set<string>,
  counts: IngestionCounts,
  failures: Array<{ path: string; error: string }>,
  report: (message: string) => void,
): Promise<void> => {
  // Flatten every chunk in the window into one list, remembering which
  // document each came from so the vectors can be handed back afterwards.
  const texts: string[] = [];
  const owners: number[] = [];

  window.forEach((prepared, documentIndex) => {
    for (const chunk of prepared.chunks) {
      texts.push(embeddingText(chunk));
      owners.push(documentIndex);
    }
  });

  let vectors: number[][];
  try {
    vectors = await embed(texts, "document");
  } catch (error) {
    // A batch failure cannot be attributed to a single document, so every
    // document in the window is recorded as failed rather than silently
    // skipped.
    const message = error instanceof Error ? error.message : String(error);
    for (const prepared of window) {
      counts.failed++;
      failures.push({ path: prepared.source.path, error: message });
      await markDocumentFailed(prepared.source.path, message).catch(() => {});
    }
    report(`  FAILED to embed ${window.length} document(s): ${message}`);
    return;
  }

  const vectorsByDocument = new Map<number, number[][]>();
  owners.forEach((documentIndex, i) => {
    const list = vectorsByDocument.get(documentIndex) ?? [];
    const vector = vectors[i];
    if (vector) list.push(vector);
    vectorsByDocument.set(documentIndex, list);
  });

  for (const [documentIndex, prepared] of window.entries()) {
    const documentVectors = vectorsByDocument.get(documentIndex) ?? [];
    try {
      await replaceDocument(
        {
          path: prepared.source.path,
          title: prepared.source.title,
          docType: prepared.source.docType,
          docDate: prepared.source.docDate,
          contentHash: prepared.source.contentHash,
          byteSize: prepared.source.byteSize,
        },
        prepared.chunks.map((chunk, i) => ({
          ordinal: chunk.ordinal,
          headingPath: chunk.headingPath,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          embedding: documentVectors[i] ?? null,
        })),
      );

      if (newPaths.has(prepared.source.path)) counts.added++;
      else counts.updated++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      counts.failed++;
      failures.push({ path: prepared.source.path, error: message });
      await markDocumentFailed(prepared.source.path, message).catch(() => {});
      report(`  FAILED ${prepared.source.path}: ${message}`);
    }
  }
};

/**
 * Runs one ingestion pass.
 *
 * Incremental by construction: only added and changed documents are embedded,
 * so re-running after editing one file costs one embedding call rather than
 * 142. A failure on one document is recorded against that document and does
 * not abort the run.
 */
export const ingest = async (options: IngestOptions): Promise<IngestResult> => {
  const startedAt = Date.now();
  const report = options.onProgress ?? (() => {});
  const runId = await startIngestionRun(options.trigger);

  const counts: IngestionCounts = { added: 0, updated: 0, unchanged: 0, removed: 0, failed: 0 };
  const failures: Array<{ path: string; error: string }> = [];

  try {
    const source = await discoverDocuments(options.corpusDir);
    const indexed: IndexedDocumentRow[] = await listIndexedDocuments();

    const plan = planIngestion(source, indexed, { force: options.force ?? false });
    counts.unchanged = plan.unchanged.length;

    report(
      `${plan.added.length} new, ${plan.updated.length} changed, ` +
        `${plan.unchanged.length} unchanged, ${plan.removed.length} removed`,
    );

    const newPaths = new Set(plan.added.map((doc) => doc.path));
    const pending = [...plan.added, ...plan.updated];

    // Chunking is pure and cheap, so it happens up front — that is what makes
    // embedding batchable across documents.
    const prepared: PreparedDocument[] = pending.map((doc) => ({
      source: doc,
      chunks: chunkMarkdown(doc.content),
    }));

    for (let i = 0; i < prepared.length; i += INGEST_WINDOW) {
      const window = prepared.slice(i, i + INGEST_WINDOW);
      await indexWindow(window, newPaths, counts, failures, report);
      report(`  indexed ${Math.min(i + window.length, prepared.length)}/${prepared.length}`);
    }

    if (plan.removed.length > 0) {
      await deleteDocuments(plan.removed.map((doc) => doc.id));
      counts.removed = plan.removed.length;
      report(`  removed ${plan.removed.length} document(s) no longer on disk`);
    }

    const durationMs = Date.now() - startedAt;
    await finishIngestionRun({
      runId,
      status: counts.failed > 0 ? "failed" : "succeeded",
      counts,
      durationMs,
    });

    return { runId, counts, durationMs, failures };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishIngestionRun({
      runId,
      status: "failed",
      counts,
      durationMs: Date.now() - startedAt,
      error: message,
    });
    throw error;
  }
};
