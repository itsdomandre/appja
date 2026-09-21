// @vitest-environment node
//
// Route tests for PATCH /api/registrations/[id]/status (sub-task 4).
//
// Covers AC19 (a valid admin session updating status to `aprovado` persists
// and is reflected in a subsequent read) and AC20 (an out-of-range status
// value is rejected with a 400 naming the invalid status, and the stored
// status does not change) from spec.md §8.
//
// Runs against the real local Supabase/Postgres stack (no mocking), same
// convention as app/api/registrations/[id]/route.test.ts (sub-task 3).
//
// Dynamic route param shape decision: same as sub-task 3 -- Next.js (this
// repo is on ^16) passes route params to Route Handlers as
// `{ params: Promise<{ id: string }> }`.
//
// Response shape decision (not fixed by spec.md/decisions.md, made here as
// part of writing the failing spec): 200 body is `{ id, status }` reflecting
// the newly persisted status; 400 body is `{ error: string }` whose message
// contains the rejected status value; 401 body is `{ error: string }` naming
// the missing/invalid session (matching the convention already established
// by requireAdminSession's own message and sub-task 3's tests); 404 body is
// `{ error: string }` whose message contains the requested id (matching
// [id]/route.ts's GET, for consistency across this resource's routes).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { PATCH } from "./route";
import { POST as loginPOST } from "@/app/api/admin/login/route";

const DB_URL = process.env.SUPABASE_DB_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!DB_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
  throw new Error(
    "Missing SUPABASE_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_PASSWORD. " +
      "Start the local Supabase stack with `npx supabase start` and ensure " +
      ".env.test is loaded (see vitest.setup.ts).",
  );
}

const TEST_NOME = "Status TestUser";

function buildStatusRequest(id: string, body: unknown, cookie?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return new Request(`http://localhost/api/registrations/${id}/status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
}

function paramsFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/registrations/[id]/status", () => {
  let db: Client;
  const supabaseAdmin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  let registrationId: string;
  const fotoPath = `status-fixture-${crypto.randomUUID()}.jpg`;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  // Every test gets its own freshly seeded row, so each test is independent
  // (no ordering coupling) even though this route doesn't touch the photo.
  beforeEach(async () => {
    const { data, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        nome: TEST_NOME,
        telefone: "912345678",
        data_nascimento: "2000-01-01",
        ano_escolar: "9º ano",
        localidade: "Lisboa",
        email: "status@example.com",
        foto_path: fotoPath,
        consentimento: true,
        status: "pendente",
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to seed fixture row: ${error?.message}`);
    }
    registrationId = data.id;
  });

  afterEach(async () => {
    await db.query("delete from public.registrations where nome = $1", [TEST_NOME]);
  });

  async function validSessionCookiePair(): Promise<string> {
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

  async function storedStatus(id: string): Promise<string> {
    const result = await db.query<{ status: string }>(
      "select status from public.registrations where id = $1",
      [id],
    );
    expect(result.rows.length).toBe(1);
    return result.rows[0]!.status;
  }

  it("AC19: with a valid admin session, updating status to 'aprovado' persists that value and is reflected in a subsequent read", async () => {
    const cookie = await validSessionCookiePair();

    const res = await PATCH(
      buildStatusRequest(registrationId, { status: "aprovado" }, cookie),
      paramsFor(registrationId),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(registrationId);
    expect(body.status).toBe("aprovado");

    // Prove persistence with a fresh, independent read (direct DB query),
    // not just trust in the PATCH response body.
    expect(await storedStatus(registrationId)).toBe("aprovado");

    const { data: reread, error } = await supabaseAdmin
      .from("registrations")
      .select("status")
      .eq("id", registrationId)
      .single();
    expect(error).toBeNull();
    expect(reread?.status).toBe("aprovado");
  });

  it("AC19: updating status to 'rejeitado' also persists and is reflected in a subsequent read", async () => {
    const cookie = await validSessionCookiePair();

    const res = await PATCH(
      buildStatusRequest(registrationId, { status: "rejeitado" }, cookie),
      paramsFor(registrationId),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("rejeitado");
    expect(await storedStatus(registrationId)).toBe("rejeitado");
  });

  it("AC20: attempting to update status to a value outside {pendente, aprovado, rejeitado} is rejected with 400 naming the invalid status, and the stored status does not change", async () => {
    const cookie = await validSessionCookiePair();

    const res = await PATCH(
      buildStatusRequest(registrationId, { status: "foo" }, cookie),
      paramsFor(registrationId),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("foo");
    expect(String(body.error).toLowerCase()).toMatch(/status|inválid|invalid/);

    // The stored status must remain what it was before the rejected attempt.
    expect(await storedStatus(registrationId)).toBe("pendente");
  });

  it("AC20: an empty-string status is rejected with 400 naming the invalid status, and the stored status does not change", async () => {
    const cookie = await validSessionCookiePair();

    const res = await PATCH(
      buildStatusRequest(registrationId, { status: "" }, cookie),
      paramsFor(registrationId),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/status|inválid|invalid/);
    expect(await storedStatus(registrationId)).toBe("pendente");
  });

  it("AC20: a wrong-typed status (number, not string) is rejected with 400, and the stored status does not change", async () => {
    const cookie = await validSessionCookiePair();

    const res = await PATCH(
      buildStatusRequest(registrationId, { status: 1 }, cookie),
      paramsFor(registrationId),
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/status|inválid|invalid/);
    expect(await storedStatus(registrationId)).toBe("pendente");
  });

  it("rejects a caller with no valid admin session cookie with a 4xx response naming the missing/invalid session, and the stored status does not change (this handler's own check -- middleware.ts is not in the request path when the handler is invoked directly, as here)", async () => {
    const res = await PATCH(
      buildStatusRequest(registrationId, { status: "aprovado" }),
      paramsFor(registrationId),
    );

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/sess|auth|autentic/);

    expect(await storedStatus(registrationId)).toBe("pendente");
  });

  it("updating the status of a non-existent id returns a 'not found' response naming that no registration exists for that id (consistency with GET /api/registrations/[id]'s AC18 handling)", async () => {
    const missingId = crypto.randomUUID();
    const cookie = await validSessionCookiePair();

    const res = await PATCH(
      buildStatusRequest(missingId, { status: "aprovado" }, cookie),
      paramsFor(missingId),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(String(body.error)).toContain(missingId);
    expect(String(body.error).toLowerCase()).toMatch(
      /não encontrado|not found|no such|does not exist/,
    );
  });

  it("db / spec.md §9 risk (\"senha única compartilhada\" + last-line-of-defense note): the database CHECK constraint itself rejects an invalid status even when written directly, bypassing the route's own validation entirely", async () => {
    await expect(
      db.query("update public.registrations set status = $1 where id = $2", [
        "not-a-real-status",
        registrationId,
      ]),
    ).rejects.toThrow(/check constraint|registrations_status_check/i);

    // The DB itself refused the write -- status is still whatever it was
    // before this direct attempt (proving the CHECK is a real backstop, not
    // just the route's problem to get right).
    expect(await storedStatus(registrationId)).toBe("pendente");
  });
});
