// @vitest-environment node
//
// Route tests for POST /api/admin/login.
//
// Covers AC9-AC11 spec.md §8 / use case 2 (see
// specs/registration-backoffice/spec.md §5.2, §5.3 "Duração da sessão admin"):
//   - AC10: the correct password sets a valid, httpOnly session cookie.
//   - AC11: an incorrect (or missing) password fails with a response naming
//     invalid credentials, and sets no session cookie.
//
// The rest of AC10 ("concede acesso a /backoffice") is exercised end-to-end
// through the middleware in middleware.test.ts, since the middleware is what
// actually decides access -- asserting on this route's response alone can't
// prove that.
//
// This test contract requires a JSON body shaped `{ "password": string }`;
// that request shape isn't fixed by spec.md/decisions.md, so it's a decision
// made here as part of writing the failing spec.
import { describe, it, expect } from "vitest";
import { POST } from "./route";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const WRONG_PASSWORD = "definitely-not-the-admin-password";

if (!ADMIN_PASSWORD) {
  throw new Error(
    "Missing ADMIN_PASSWORD. Set it in .env.test (see vitest.setup.ts) so the " +
      "admin login flow can be exercised.",
  );
}
if (ADMIN_PASSWORD === WRONG_PASSWORD) {
  throw new Error("Test fixture collision: ADMIN_PASSWORD must not equal WRONG_PASSWORD");
}

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/login", () => {
  it("AC10: the correct password succeeds and sets a single, httpOnly session cookie with a real value", async () => {
    const res = await POST(buildRequest({ password: ADMIN_PASSWORD }));

    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);

    const setCookies = res.headers.getSetCookie();
    expect(setCookies).toHaveLength(1);

    const cookie = setCookies[0]!;
    expect(cookie.toLowerCase()).toContain("httponly");

    const [pair] = cookie.split(";");
    const [, value] = pair!.split("=");
    expect(value).toBeTruthy();
  });

  it("AC11: an incorrect password fails naming invalid credentials, and sets no cookie", async () => {
    const res = await POST(buildRequest({ password: WRONG_PASSWORD }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/senha|password|credenc|invalid/);

    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("AC11: a request with no password field fails the same way, without a server error, and sets no cookie", async () => {
    const res = await POST(buildRequest({}));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/senha|password|credenc|invalid/);

    expect(res.headers.getSetCookie()).toHaveLength(0);
  });

  it("AC11: an empty-string password fails the same way, and sets no cookie", async () => {
    const res = await POST(buildRequest({ password: "" }));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/senha|password|credenc|invalid/);

    expect(res.headers.getSetCookie()).toHaveLength(0);
  });
});
