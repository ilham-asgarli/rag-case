import type { SourceDocument } from "./discover.js";

export interface IndexedDocument {
  id: string;
  path: string;
  contentHash: string;
}

export interface IngestionPlan {
  added: SourceDocument[];
  updated: SourceDocument[];
  unchanged: SourceDocument[];
  /** Indexed documents whose file no longer exists on disk. */
  removed: IndexedDocument[];
}

/**
 * Compares what is on disk against what is indexed.
 *
 * Pure and synchronous so it can be unit-tested without a database — the
 * incremental-ingest guarantee is a property of this function, and it is worth
 * testing directly rather than inferring from an end-to-end run.
 */
export const planIngestion = (
  source: SourceDocument[],
  indexed: IndexedDocument[],
  options: { force?: boolean } = {},
): IngestionPlan => {
  const indexedByPath = new Map(indexed.map((doc) => [doc.path, doc]));
  const sourcePaths = new Set(source.map((doc) => doc.path));

  const plan: IngestionPlan = { added: [], updated: [], unchanged: [], removed: [] };

  for (const doc of source) {
    const existing = indexedByPath.get(doc.path);
    if (!existing) {
      plan.added.push(doc);
    } else if (options.force || existing.contentHash !== doc.contentHash) {
      plan.updated.push(doc);
    } else {
      plan.unchanged.push(doc);
    }
  }

  for (const doc of indexed) {
    if (!sourcePaths.has(doc.path)) {
      plan.removed.push(doc);
    }
  }

  return plan;
};
