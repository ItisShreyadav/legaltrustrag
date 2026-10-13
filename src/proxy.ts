import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/*
 * Optimistic routing on cookie presence only; the database is never consulted
 * here. Pages validate the session with requireUser(), and /api/analyze checks
 * it again, so a forged or stale cookie gets no further than this redirect.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login" || pathname === "/signup") {
    return hasSessionCookie ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!hasSessionCookie) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/signup", "/runs/:path*", "/review"],
};
