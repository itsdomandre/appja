/**
 * Gates the backoffice (spec.md §6): protects `/backoffice/**` and the
 * admin-facing `/api/registrations` (GET/PATCH) and `/api/registrations/[id]/**`
 * routes, redirecting to `/backoffice/login` when there is no valid admin
 * session cookie. `/backoffice/login` itself, and the public
 * `POST /api/registrations` submission route (sub-task 1), are never gated.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";

const LOGIN_PATH = "/backoffice/login";

function requiresAuth(pathname: string, method: string): boolean {
  if (pathname === LOGIN_PATH) return false;

  if (pathname === "/backoffice" || pathname.startsWith("/backoffice/")) {
    return true;
  }

  const isRegistrationsAdminRoute =
    pathname === "/api/registrations" || pathname.startsWith("/api/registrations/");
  if (isRegistrationsAdminRoute && (method === "GET" || method === "PATCH")) {
    return true;
  }

  return false;
}

export async function middleware(request: NextRequest): Promise<Response> {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();

  if (!requiresAuth(pathname, method)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const hasValidSession = await verifySessionToken(token);

  if (!hasValidSession) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/backoffice/:path*", "/api/registrations", "/api/registrations/:path*"],
};
