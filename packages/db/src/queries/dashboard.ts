import type { DocumentListQuery, DocumentSummary, IngestionRun, SearchStats } from "@rag/contracts";
import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../client";
import { chunks, documents } from "../schema/corpus";
import { ingestionRuns, searchQueries } from "../schema/operations";

const iso = (value: Date | null): string | null => value?.toISOString() ?? null;

export const listDocuments = async (
  query: DocumentListQuery,
): Promise<{ documents: DocumentSummary[]; total: number }> => {
  const db = getDb();

  const filters = [
    query.status ? eq(documents.status, query.status) : undefined,
    query.docType ? eq(documents.docType, query.docType) : undefined,
    query.search
      ? or(ilike(documents.title, `%${query.search}%`), ilike(documents.path, `%${query.search}%`))
      : undefined,
  ].filter((clause) => clause !== undefined);

  const where = filters.length > 0 ? and(...filters) : undefined;

  const rows = await db
    .select()
    .from(documents)
    .where(where)
    .orderBy(documents.path)
    .limit(query.limit)
    .offset(query.offset);

  const [totalRow] = await db.select({ value: count() }).from(documents).where(where);

  return {
    documents: rows.map((row) => ({
      id: row.id,
      path: row.path,
      title: row.title,
      docType: row.docType,
      docDate: iso(row.docDate),
      status: row.status,
      chunkCount: row.chunkCount,
      byteSize: row.byteSize,
      contentHash: row.contentHash,
      indexedAt: iso(row.indexedAt),
      lastError: row.lastError,
    })),
    total: totalRow?.value ?? 0,
  };
};

export const getDocumentDetail = async (id: string) => {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return null;

  const rows = await db
    .select({
      id: chunks.id,
      ordinal: chunks.ordinal,
      headingPath: chunks.headingPath,
      content: chunks.content,
      tokenCount: chunks.tokenCount,
    })
    .from(chunks)
    .where(eq(chunks.documentId, id))
    .orderBy(chunks.ordinal);

  return {
    id: doc.id,
    path: doc.path,
    title: doc.title,
    docType: doc.docType,
    docDate: iso(doc.docDate),
    status: doc.status,
    chunkCount: doc.chunkCount,
    byteSize: doc.byteSize,
    contentHash: doc.contentHash,
    indexedAt: iso(doc.indexedAt),
    lastError: doc.lastError,
    chunks: rows,
  };
};

export const listIngestionRuns = async (limit = 20): Promise<IngestionRun[]> => {
  const rows = await getDb()
    .select()
    .from(ingestionRuns)
    .orderBy(desc(ingestionRuns.startedAt))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    counts: row.counts,
    startedAt: row.startedAt.toISOString(),
    finishedAt: iso(row.finishedAt),
    durationMs: row.durationMs,
    error: row.error,
  }));
};

export const getIndexHealth = async () => {
  const db = getDb();

  const [docStats] = await db
    .select({
      total: count(),
      indexed: sql`count(*) filter (where ${documents.status} = 'indexed')`.mapWith(Number),
      failed: sql`count(*) filter (where ${documents.status} = 'failed')`.mapWith(Number),
      // Borrows the column's timestamp decoder; a bare fragment would arrive as a string.
      lastIndexedAt: sql`max(${documents.indexedAt})`.mapWith(documents.indexedAt),
    })
    .from(documents);

  const [chunkStats] = await db
    .select({
      total: count(),
      avgTokens: sql`coalesce(avg(${chunks.tokenCount}), 0)`.mapWith(Number),
    })
    .from(chunks);

  return {
    documentCount: docStats?.total ?? 0,
    indexedCount: docStats?.indexed ?? 0,
    failedCount: docStats?.failed ?? 0,
    chunkCount: chunkStats?.total ?? 0,
    avgChunkTokens: Math.round(chunkStats?.avgTokens ?? 0),
    lastIndexedAt: iso(docStats?.lastIndexedAt ?? null),
  };
};

export const getSearchStats = async (): Promise<SearchStats> => {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [totals] = await db
    .select({
      total: count(),
      // percentile_cont interpolates, so round back to whole milliseconds.
      p50: sql`coalesce(percentile_cont(0.5) within group (order by ${searchQueries.latencyMs}), 0)::int`.mapWith(
        Number,
      ),
      p95: sql`coalesce(percentile_cont(0.95) within group (order by ${searchQueries.latencyMs}), 0)::int`.mapWith(
        Number,
      ),
      abstained: sql`count(*) filter (where ${searchQueries.abstained} is true)`.mapWith(Number),
      withAnswer: sql`count(*) filter (where ${searchQueries.abstained} is not null)`.mapWith(
        Number,
      ),
    })
    .from(searchQueries);

  const [recent] = await db
    .select({ value: count() })
    .from(searchQueries)
    .where(gte(searchQueries.createdAt, weekAgo));

  const bySource = await db
    .select({ source: searchQueries.source, count: count() })
    .from(searchQueries)
    .groupBy(searchQueries.source);

  const topQueries = await db
    .select({ query: searchQueries.query, count: count() })
    .from(searchQueries)
    .groupBy(searchQueries.query)
    .orderBy(desc(count()))
    .limit(8);

  const volumeByDay = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${searchQueries.createdAt}), 'YYYY-MM-DD')`,
      count: count(),
    })
    .from(searchQueries)
    .where(gte(searchQueries.createdAt, weekAgo))
    .groupBy(sql`date_trunc('day', ${searchQueries.createdAt})`)
    .orderBy(sql`date_trunc('day', ${searchQueries.createdAt})`);

  const answered = totals?.withAnswer ?? 0;

  return {
    totalQueries: totals?.total ?? 0,
    queriesLast7Days: recent?.value ?? 0,
    abstainRate: answered > 0 ? (totals?.abstained ?? 0) / answered : 0,
    latencyP50Ms: totals?.p50 ?? 0,
    latencyP95Ms: totals?.p95 ?? 0,
    bySource: bySource.map((row) => ({ source: row.source, count: row.count })),
    topQueries: topQueries.map((row) => ({ query: row.query, count: row.count })),
    volumeByDay: volumeByDay.map((row) => ({ day: row.day, count: row.count })),
  };
};
