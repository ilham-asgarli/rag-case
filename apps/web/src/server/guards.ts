import { auth, type Session } from "@rag/auth";
import { ERROR_STATUS, type ErrorCode } from "@rag/contracts";
import { headers } from "next/headers";

/**
 * Authorization helpers.
 *
 * These are the access-control boundary. `proxy.ts` shapes navigation so a
 * signed-out visitor lands on the sign-in page, but it is not a security
 * control: it does not run for every path that reaches a handler, and it can
 * be bypassed by calling an API route directly. Every protected route handler
 * and server component therefore calls one of these itself.
 */

export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "HttpError";
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}

export type SessionUser = Session["user"];

export const getSession = async (): Promise<Session | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  return result ?? null;
};

/** Throws `unauthorized` when there is no session. */
export const requireSession = async (): Promise<Session> => {
  const session = await getSession();
  if (!session) {
    throw new HttpError("unauthorized", "You must be signed in.");
  }
  return session;
};

/**
 * Throws `forbidden` for a signed-in non-admin, `unauthorized` when signed out.
 *
 * The distinction matters: a signed-in user hitting an admin route should be
 * told they lack permission, not bounced to sign-in as though their session
 * had expired.
 */
export const requireAdmin = async (): Promise<Session> => {
  const session = await requireSession();
  if (session.user.role !== "admin") {
    throw new HttpError("forbidden", "This action requires an administrator account.");
  }
  return session;
};
