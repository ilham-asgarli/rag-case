import { z } from "zod";

/** Document categories, derived from the corpus directory a file lives in. */
export const docTypeSchema = z.enum([
  "general",
  "client-brief",
  "meeting-note",
  "delivery-report",
  "changelog",
  "postmortem",
  "guide",
]);
export type DocType = z.infer<typeof docTypeSchema>;

export const roleSchema = z.enum(["admin", "user"]);
export type Role = z.infer<typeof roleSchema>;

/**
 * Stable error codes. Handlers return one of these instead of an exception
 * message, so a client can branch on the code and a stack trace can never
 * reach the browser.
 */
export const errorCodeSchema = z.enum([
  "unauthorized",
  "forbidden",
  "not_found",
  "invalid_request",
  "rate_limited",
  "provider_error",
  "internal",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** HTTP status for each error code, so handlers never pick one by hand. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_request: 400,
  rate_limited: 429,
  provider_error: 502,
  internal: 500,
};

/** Where a search came from. MCP traffic is attributed so it shows in analytics. */
export const searchSourceSchema = z.enum(["chat", "search", "mcp"]);
export type SearchSource = z.infer<typeof searchSourceSchema>;
