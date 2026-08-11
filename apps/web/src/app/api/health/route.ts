import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe for the container healthcheck.
 *
 * Deliberately unauthenticated and deliberately empty of detail: a health
 * endpoint that reports version numbers, database state, or configuration is
 * a free reconnaissance endpoint for anyone who can reach it.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: "ok" });
}
