import type { DocType } from "@rag/contracts";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../client.js";
import { chunks, documents } from "../schema/corpus.js";

/**
 * Corpus reads and writes.
 *
 * Every SQL statement in the system is issued from this package. Besides
 * keeping the layering honest, it means drizzle-orm is imported exactly once —
 * pnpm resolves it per peer-dependency context, so importing it from two
 * packages yields two physically distinct copies whose types do not unify.
 */

export interface IndexedDocumentRow {
  id: string;
  path: string;
  contentHash: string;
}

export const listIndexedDocuments = async (): Promise<IndexedDocumentRow[]> =>
  getDb()
    .select({ id: documents.id, path: documents.path, contentHash: documents.contentHash })
    .from(documents);

export interface ChunkInput {
  ordinal: number;
  headingPath: string[];
  content: string;
  tokenCount: number;
  embedding: number[] | null;
}

export interface DocumentInput {
  path: string;
  title: string;
  docType: DocType;
  docDate: Date | null;
  contentHash: string;
  byteSize: number;
}

/**
 * Replaces a document and all of its chunks in one transaction.
 *
 * Atomic on purpose: a reader mid-ingest sees either the previous version or
 * the new one, never a document with half its chunks.
 */
export const replaceDocument = async (
  doc: DocumentInput,
  documentChunks: ChunkInput[],
): Promise<string> => {
  return getDb().transaction(async (tx) => {
    const now = new Date();
    const values = {
      title: doc.title,
      docType: doc.docType,
      docDate: doc.docDate,
      contentHash: doc.contentHash,
      byteSize: doc.byteSize,
      status: "indexed" as const,
      chunkCount: documentChunks.length,
      lastError: null,
      indexedAt: now,
      updatedAt: now,
    };

    const [row] = await tx
      .insert(documents)
      .values({ path: doc.path, ...values })
      .onConflictDoUpdate({ target: documents.path, set: values })
      .returning({ id: documents.id });

    if (!row) throw new Error(`Failed to upsert document ${doc.path}`);

    await tx.delete(chunks).where(eq(chunks.documentId, row.id));

    if (documentChunks.length > 0) {
      await tx.insert(chunks).values(
        documentChunks.map((chunk) => ({
          documentId: row.id,
          ordinal: chunk.ordinal,
          headingPath: chunk.headingPath,
          headingText: chunk.headingPath.join(" > "),
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          embedding: chunk.embedding,
        })),
      );
    }

    return row.id;
  });
};

export const markDocumentFailed = async (path: string, message: string): Promise<void> => {
  await getDb()
    .update(documents)
    .set({ status: "failed", lastError: message.slice(0, 1000), updatedAt: new Date() })
    .where(eq(documents.path, path));
};

/** Chunks cascade with the document row. */
export const deleteDocuments = async (ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  await getDb().delete(documents).where(inArray(documents.id, ids));
};

// Extends Record<string, unknown> because drizzle's `execute<T>` constrains its
// row type to an indexable shape.
export interface CandidateRow extends Record<string, unknown> {
  chunk_id: string;
  document_id: string;
  ordinal: number;
  heading_path: string[] | null;
  content: string;
  path: string;
  title: string;
  doc_type: DocType;
  doc_date: Date | null;
  vector_rank: number | null;
  lexical_rank: number | null;
  rrf: number;
}

export interface CandidateQuery {
  queryText: string;
  queryVector: number[];
  docType: DocType | undefined;
  perArm: number;
  rrfK: number;
  limit: number;
}

/**
 * Hybrid candidate generation in a single round trip.
 *
 * Two CTEs — dense (HNSW, cosine distance) and lexical (GIN, ts_rank_cd) —
 * joined FULL OUTER so a chunk found by either arm survives, then fused by
 * Reciprocal Rank Fusion.
 *
 * The fusion is done in SQL rather than in TypeScript because that is where
 * the ranks are produced, and because it avoids shipping 80 rows of document
 * text over the wire only to score and discard most of them.
 */
export const fetchHybridCandidates = async (query: CandidateQuery): Promise<CandidateRow[]> => {
  const vectorLiteral = `[${query.queryVector.join(",")}]`;
  const docTypeFilter = query.docType ? sql`AND d.doc_type = ${query.docType}` : sql``;

  const result = await getDb().execute<CandidateRow>(sql`
    WITH dense AS (
      SELECT c.id,
             ROW_NUMBER() OVER (ORDER BY c.embedding <=> ${vectorLiteral}::vector) AS rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id
      WHERE c.embedding IS NOT NULL AND d.status = 'indexed' ${docTypeFilter}
      ORDER BY c.embedding <=> ${vectorLiteral}::vector
      LIMIT ${query.perArm}
    ),
    lexical AS (
      SELECT c.id,
             ROW_NUMBER() OVER (ORDER BY ts_rank_cd(c.tsv, q.query) DESC) AS rank
      FROM chunks c
      JOIN documents d ON d.id = c.document_id,
           websearch_to_tsquery('english', ${query.queryText}) AS q(query)
      WHERE c.tsv @@ q.query AND d.status = 'indexed' ${docTypeFilter}
      ORDER BY ts_rank_cd(c.tsv, q.query) DESC
      LIMIT ${query.perArm}
    ),
    fused AS (
      SELECT COALESCE(dense.id, lexical.id) AS id,
             dense.rank AS vector_rank,
             lexical.rank AS lexical_rank,
             COALESCE(1.0 / (${query.rrfK} + dense.rank), 0)
               + COALESCE(1.0 / (${query.rrfK} + lexical.rank), 0) AS rrf
      FROM dense
      FULL OUTER JOIN lexical ON dense.id = lexical.id
    )
    SELECT c.id           AS chunk_id,
           c.document_id  AS document_id,
           c.ordinal      AS ordinal,
           c.heading_path AS heading_path,
           c.content      AS content,
           d.path         AS path,
           d.title        AS title,
           d.doc_type     AS doc_type,
           d.doc_date     AS doc_date,
           fused.vector_rank,
           fused.lexical_rank,
           fused.rrf
    FROM fused
    JOIN chunks c    ON c.id = fused.id
    JOIN documents d ON d.id = c.document_id
    ORDER BY fused.rrf DESC
    LIMIT ${query.limit}
  `);

  // postgres.js returns an array; drizzle may wrap it in { rows }.
  return Array.isArray(result) ? result : ((result as { rows?: CandidateRow[] }).rows ?? []);
};

export interface DocumentContentRow {
  path: string;
  title: string;
  docType: DocType;
  docDate: Date | null;
  content: string;
}

/** Reassembles a document's full text from its chunks, in order. */
export const getDocumentByPath = async (path: string): Promise<DocumentContentRow | null> => {
  const rows = await getDb()
    .select({
      path: documents.path,
      title: documents.title,
      docType: documents.docType,
      docDate: documents.docDate,
      content: chunks.content,
      ordinal: chunks.ordinal,
    })
    .from(documents)
    .innerJoin(chunks, eq(chunks.documentId, documents.id))
    .where(eq(documents.path, path))
    .orderBy(chunks.ordinal);

  const first = rows[0];
  if (!first) return null;

  return {
    path: first.path,
    title: first.title,
    docType: first.docType,
    docDate: first.docDate,
    content: rows.map((row) => row.content).join("\n\n"),
  };
};
