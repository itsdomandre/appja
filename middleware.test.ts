// @vitest-environment node
//
// Tests for middleware.ts, the gate that protects /backoffice/** and the
// admin data routes under /api/registrations (spec.md §6, §8).
//
// Covers:
//   - AC9: no valid admin session -> redirect to /backoffice/login, for
//     both /backoffice and "its data route" (GET /api/registrations).
//   - AC10: a valid admin session (the cookie issued by a successful login)
//     -> access granted, i.e. no redirect.
//   - AC21: the cookie left behind by logout no longer grants access -> a
//     subsequent request redirects to /backoffice/login again.
//
// Also guards the GET/PATCH-only scope of the /api/registrations protection
// stated verbatim in spec.md §6 ("protege... /api/registrations (GET/PATCH)"),
// since a blanket matcher would silently break the already-shipped public
// POST /api/registrations submission flow (sub-task 1).
//
// We test the middleware function directly against constructed NextRequests
// rather than standing up the (not-yet-built) /backoffice list page, per the
// sub-task's guidance -- the middleware itself doesn't care whether a
// downstream route/page exists.
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware";
import { POST as loginPOST } from "@/app/api/admin/login/route";
import { POST as logoutPOST } from "@/app/api/admin/logout/route";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const LOGIN_PATH = "/backoffice/login";

if (!ADMIN_PASSWORD) {
  throw new Error(
    "Missing ADMIN_PASSWORD. Set it in .env.test (see vitest.setup.ts) so the " +
      "admin login/session flow can be exercised.",
  );
}

async function loginResponse(password: string): Promise<Response> {
  return loginPOST(
    new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  );
}

function extractSetCookiePair(res: Response): string {
  const setCookies = res.headers.getSetCookie();
  expect(setCookies.length).toBeGreaterThan(0);
  return setCookies[0]!.split(";")[0]!;
}

async function getValidSessionCookiePair(): Promise<string> {
  const res = await loginResponse(ADMIN_PASSWORD!);
  return extractSetCookiePair(res);
}

async function getClearedSessionCookiePair(): Promise<string> {
  const cookiePair = await getValidSessionCookiePair();
  const logoutRes = await logoutPOST(
    new Request("http://localhost/api/admin/logout", {
      method: "POST",
      headers: { cookie: cookiePair },
    }),
  );
  return extractSetCookiePair(logoutRes);
}

function requestWithCookie(
  path: string,
  cookiePair: string | undefined,
  init: { method?: string } = {},
): NextRequest {
  const headers = new Headers();
  if (cookiePair) headers.set("cookie", cookiePair);
  return new NextRequest(`http://localhost${path}`, { method: init.method ?? "GET", headers });
}

function expectRedirectsToLogin(res: Response | undefined) {
  expect(res).toBeTruthy();
  const location = res!.headers.get("location");
  expect(location).toBeTruthy();
  expect(new URL(location!).pathname).toBe(LOGIN_PATH);
}

function expectPassesThrough(res: Response | undefined) {
  // A middleware that continues the chain either returns NextResponse.next()
  // (no `location` header) or nothing at all -- either way, no redirect.
  const location = res ? res.headers.get("location") : null;
  expect(location).toBeNull();
}

describe("middleware", () => {
  describe("AC9: no valid admin session", () => {
    it("redirects GET /backoffice with no session cookie to /backoffice/login", async () => {
      const res = await middleware(requestWithCookie("/backoffice", undefined));
      expectRedirectsToLogin(res);
    });

    it("redirects GET /api/registrations (the admin data route) with no session cookie to /backoffice/login", async () => {
      const res = await middleware(requestWithCookie("/api/registrations", undefined));
      expectRedirectsToLogin(res);
    });

    it("redirects GET /backoffice when the session cookie is present but invalid/tampered", async () => {
      const res = await middleware(
        requestWithCookie("/backoffice", "admin_session=not-a-real-signed-token"),
      );
      expectRedirectsToLogin(res);
    });
  });

  describe("AC10: valid admin session", () => {
    it("grants access to GET /backoffice (no redirect) with the cookie issued by a successful login", async () => {
      const cookiePair = await getValidSessionCookiePair();
      const res = await middleware(requestWithCookie("/backoffice", cookiePair));
      expectPassesThrough(res);
    });

    it("grants access to GET /api/registrations (no redirect) with the cookie issued by a successful login", async () => {
      const cookiePair = await getValidSessionCookiePair();
      const res = await middleware(requestWithCookie("/api/registrations", cookiePair));
      expectPassesThrough(res);
    });
  });

  describe("route-matching scope (spec.md §6: /api/registrations is protected for GET/PATCH only)", () => {
    it("does not redirect POST /api/registrations (the public submission route) even with no session", async () => {
      const res = await middleware(
        requestWithCookie("/api/registrations", undefined, { method: "POST" }),
      );
      expectPassesThrough(res);
    });
  });

  describe("AC21: a session cleared by logout no longer grants access", () => {
    it("redirects GET /backoffice to /backoffice/login using the cookie left behind by logout", async () => {
      const clearedCookiePair = await getClearedSessionCookiePair();
      const res = await middleware(requestWithCookie("/backoffice", clearedCookiePair));
      expectRedirectsToLogin(res);
    });
  });
});
