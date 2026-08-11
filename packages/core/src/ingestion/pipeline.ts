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
import { chunkMarkdown, embeddingText } from "../chunking/markdown-chunker";
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

/** Chunks, embeds, and atomically replaces one document's chunks. */
const indexDocument = async (doc: SourceDocument): Promise<void> => {
  const chunks = chunkMarkdown(doc.content);
  const vectors =
    chunks.length > 0
      ? await embed(
          chunks.map((chunk) => embeddingText(chunk)),
          "document",
        )
      : [];

  await replaceDocument(
    {
      path: doc.path,
      title: doc.title,
      docType: doc.docType,
      docDate: doc.docDate,
      contentHash: doc.contentHash,
      byteSize: doc.byteSize,
    },
    chunks.map((chunk, i) => ({
      ordinal: chunk.ordinal,
      headingPath: chunk.headingPath,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      embedding: vectors[i] ?? null,
    })),
  );
};

/**
 * Runs one ingestion pass.
 *
 * Incremental by construction: only added and changed documents are embedded,
 * so re-running after editing one file costs one embedding call rather than
 * 142. A failure on one document is recorded against that document and does
 * not abort the run — one malformed file should not block the rest.
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

    for (const doc of [...plan.added, ...plan.updated]) {
      try {
        await indexDocument(doc);
        if (newPaths.has(doc.path)) counts.added++;
        else counts.updated++;
        report(`  indexed ${doc.path}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        counts.failed++;
        failures.push({ path: doc.path, error: message });
        await markDocumentFailed(doc.path, message).catch(() => {});
        report(`  FAILED ${doc.path}: ${message}`);
      }
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
