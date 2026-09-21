// @vitest-environment node
//
// Route tests for POST /api/admin/logout.
//
// Covers AC21 (spec.md §8 / §5.2 use case 6): logging out clears the admin
// session cookie. The other half of AC21 ("uma requisição subsequente a
// /backoffice redireciona novamente para /backoffice/login") is exercised
// end-to-end through the middleware in middleware.test.ts, since the
// middleware is what actually decides access -- asserting on this route's
// response alone can't prove that a follow-up request is rejected.
import { describe, it, expect } from "vitest";
import { POST as loginPOST } from "@/app/api/admin/login/route";
import { POST as logoutPOST } from "./route";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
  throw new Error(
    "Missing ADMIN_PASSWORD. Set it in .env.test (see vitest.setup.ts) so the " +
      "admin login/logout flow can be exercised.",
  );
}

async function loggedInSessionCookiePair(): Promise<string> {
  const res = await loginPOST(
    new Request("http://localhost/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    }),
  );
  const setCookies = res.headers.getSetCookie();
  expect(setCookies.length).toBeGreaterThan(0);
  return setCookies[0]!.split(";")[0]!;
}

/** True if a Set-Cookie header value empties the cookie's value and/or expires it in the past. */
function cookieIsCleared(setCookieHeader: string): boolean {
  const lower = setCookieHeader.toLowerCase();
  const [pair] = lower.split(";");
  const [, value] = pair!.split("=");
  const emptied = !value || value.trim() === "";

  const maxAgeZero = /max-age=0\b/.test(lower);

  const expiresMatch = lower.match(/expires=([^;]+)/);
  const expiredInPast = expiresMatch ? new Date(expiresMatch[1]!).getTime() < Date.now() : false;

  return emptied || maxAgeZero || expiredInPast;
}

describe("POST /api/admin/logout", () => {
  it("AC21: clears the admin session cookie previously set by login", async () => {
    const cookiePair = await loggedInSessionCookiePair();

    const res = await logoutPOST(
      new Request("http://localhost/api/admin/logout", {
        method: "POST",
        headers: { cookie: cookiePair },
      }),
    );

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);
    expect(cookieIsCleared(setCookies[0]!)).toBe(true);
  });

  it("AC21: succeeds even when called without an existing session cookie (idempotent clear)", async () => {
    const res = await logoutPOST(
      new Request("http://localhost/api/admin/logout", { method: "POST" }),
    );

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
  });
});
