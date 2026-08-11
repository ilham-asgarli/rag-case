import { type ApiError, ERROR_STATUS, type ErrorCode } from "@rag/contracts";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { HttpError } from "./guards";

/** Builds the one error shape every handler returns. */
export const errorResponse = (code: ErrorCode, message: string): NextResponse<ApiError> =>
  NextResponse.json({ error: { code, message } }, { status: ERROR_STATUS[code] });

/**
 * Turns anything thrown inside a handler into a safe response.
 *
 * An unexpected exception becomes a generic `internal` error: the real message
 * is logged server-side, never returned. Leaking a database error to the client
 * hands an attacker schema details for free.
 */
export const toErrorResponse = (error: unknown): NextResponse<ApiError> => {
  if (error instanceof HttpError) {
    return errorResponse(error.code, error.message);
  }
  console.error("Unhandled route error:", error);
  return errorResponse("internal", "Something went wrong. Please try again.");
};

/** Parses a JSON body against a schema, raising `invalid_request` on failure. */
export const parseBody = async <T extends z.ZodTypeAny>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> => {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new HttpError("invalid_request", "Request body must be valid JSON.");
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".");
    throw new HttpError(
      "invalid_request",
      first ? `${where ? `${where}: ` : ""}${first.message}` : "Invalid request body.",
    );
  }
  return result.data;
};

/** Parses search params against a schema, raising `invalid_request` on failure. */
export const parseQuery = <T extends z.ZodTypeAny>(request: Request, schema: T): z.infer<T> => {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const result = schema.safeParse(params);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new HttpError("invalid_request", first?.message ?? "Invalid query parameters.");
  }
  return result.data;
};

/**
 * Fixed-window rate limiter, in memory.
 *
 * Deliberately simple and per-process: it exists so an authenticated user
 * cannot spend the deployment's Anthropic and Voyage budget in a loop. A
 * multi-instance deployment would move this to Redis — noted in the README
 * rather than pretended to be solved.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit = (key: string, limit: number, windowMs: number): void => {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (bucket.count >= limit) {
    throw new HttpError("rate_limited", "Too many requests. Please wait a moment.");
  }

  bucket.count++;
};
