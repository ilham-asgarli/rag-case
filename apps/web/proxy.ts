import { type NextRequest, NextResponse } from "next/server";

/**
 * Navigation shaping only.
 *
 * Next.js 16 renamed `middleware.ts` to `proxy.ts` and pinned it to the Node
 * runtime. This checks for the presence of a session cookie so a signed-out
 * visitor lands on the sign-in page instead of a flash of empty UI.
 *
 * It is NOT an access-control boundary, and it deliberately does not read the
 * user's role: a cookie's presence says nothing about whether it is valid.
 * Authorization happens in `requireSession()` / `requireAdmin()` inside every
 * protected route handler and server component, which validate the session
 * against the database.
 */
const PUBLIC_PATHS = ["/sign-in", "/sign-up"];

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Auth endpoints, OAuth discovery, the health probe, and static assets must
  // stay reachable without a session.
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/.well-known") ||
    pathname === "/api/health" ||
    pathname.startsWith("/_next")
  ) {
    return NextResponse.next();
  }

  const hasSessionCookie =
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token");

  const isPublic = PUBLIC_PATHS.some((path) => pathname.startsWith(path));

  if (!hasSessionCookie && !isPublic) {
    const signIn = new URL("/sign-in", request.url);
    if (pathname !== "/") signIn.searchParams.set("next", pathname);
    return NextResponse.redirect(signIn);
  }

  if (hasSessionCookie && isPublic) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
