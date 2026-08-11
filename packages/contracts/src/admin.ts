import { z } from "zod";
import { docTypeSchema, roleSchema, searchSourceSchema } from "./common";

export const documentStatusSchema = z.enum(["indexed", "failed", "deleted"]);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

export const documentSummarySchema = z.object({
  id: z.string(),
  path: z.string(),
  title: z.string(),
  docType: docTypeSchema,
  docDate: z.string().nullable(),
  status: documentStatusSchema,
  chunkCount: z.number().int().nonnegative(),
  byteSize: z.number().int().nonnegative(),
  contentHash: z.string(),
  indexedAt: z.string().nullable(),
  lastError: z.string().nullable(),
});
export type DocumentSummary = z.infer<typeof documentSummarySchema>;

export const chunkSummarySchema = z.object({
  id: z.string(),
  ordinal: z.number().int().nonnegative(),
  headingPath: z.array(z.string()),
  content: z.string(),
  tokenCount: z.number().int().nonnegative(),
});
export type ChunkSummary = z.infer<typeof chunkSummarySchema>;

export const documentDetailSchema = documentSummarySchema.extend({
  chunks: z.array(chunkSummarySchema),
});
export type DocumentDetail = z.infer<typeof documentDetailSchema>;

export const documentListQuerySchema = z.object({
  status: documentStatusSchema.optional(),
  docType: docTypeSchema.optional(),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;

export const documentListResponseSchema = z.object({
  documents: z.array(documentSummarySchema),
  total: z.number().int().nonnegative(),
});
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;

// --- Ingestion -------------------------------------------------------------

export const ingestionTriggerSchema = z.enum(["cli", "watch", "dashboard"]);
export type IngestionTrigger = z.infer<typeof ingestionTriggerSchema>;

export const ingestionStatusSchema = z.enum(["running", "succeeded", "failed"]);
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;

export const ingestionCountsSchema = z.object({
  added: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export type IngestionCounts = z.infer<typeof ingestionCountsSchema>;

export const ingestionRunSchema = z.object({
  id: z.string(),
  trigger: ingestionTriggerSchema,
  status: ingestionStatusSchema,
  counts: ingestionCountsSchema,
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  error: z.string().nullable(),
});
export type IngestionRun = z.infer<typeof ingestionRunSchema>;

// --- System and search statistics -----------------------------------------

export const indexHealthSchema = z.object({
  documentCount: z.number().int().nonnegative(),
  indexedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative(),
  avgChunkTokens: z.number().nonnegative(),
  embeddingModel: z.string(),
  embeddingDimensions: z.number().int().positive(),
  rerankModel: z.string(),
  answerModel: z.string(),
  vectorIndex: z.string(),
  lastIndexedAt: z.string().nullable(),
});
export type IndexHealth = z.infer<typeof indexHealthSchema>;

export const searchStatsSchema = z.object({
  totalQueries: z.number().int().nonnegative(),
  queriesLast7Days: z.number().int().nonnegative(),
  abstainRate: z.number().min(0).max(1),
  latencyP50Ms: z.number().int().nonnegative(),
  latencyP95Ms: z.number().int().nonnegative(),
  bySource: z.array(z.object({ source: searchSourceSchema, count: z.number().int() })),
  topQueries: z.array(z.object({ query: z.string(), count: z.number().int() })),
  volumeByDay: z.array(z.object({ day: z.string(), count: z.number().int() })),
});
export type SearchStats = z.infer<typeof searchStatsSchema>;

export const dashboardStatsSchema = z.object({
  index: indexHealthSchema,
  search: searchStatsSchema,
  runs: z.array(ingestionRunSchema),
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

// --- User management -------------------------------------------------------

export const userSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  createdAt: z.string(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

export const updateUserRoleSchema = z.object({
  userId: z.string().min(1),
  role: roleSchema,
});
export type UpdateUserRole = z.infer<typeof updateUserRoleSchema>;

export const inviteUserSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(100),
  role: roleSchema.default("user"),
  password: z.string().min(12, "Password must be at least 12 characters"),
});
export type InviteUser = z.infer<typeof inviteUserSchema>;
