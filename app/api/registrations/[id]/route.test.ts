// @vitest-environment node
//
// Route tests for GET /api/registrations/[id] (sub-task 3).
//
// Covers AC17 (detail + short-lived signed URL for the photo, admin session
// required) and AC18 (unknown id -> "not found" naming the id) from
// spec.md §8, plus the bucket-privacy risk noted in spec.md §9
// ("Sub-tarefa 3 deve testar explicitamente que o bucket é privado").
//
// Runs against the real local Supabase/Postgres + Storage stack (no
// mocking), same convention as app/api/registrations/route.test.ts.
//
// Dynamic route param shape decision: Next.js (this repo is on ^16) passes
// route params to Route Handlers as `{ params: Promise<{ id: string }> }`
// (see node_modules/next/dist/server/route-modules/app-route/module.d.ts),
// so GET's second argument here is built accordingly.
//
// Response shape decision (not fixed by spec.md/decisions.md, made here as
// part of writing the failing spec): 200 body is the stored columns plus a
// `foto_url` string (the signed URL); 404 body is `{ error: string }` whose
// message contains the requested id.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { GET } from "./route";
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

const TEST_NOME = "Detail TestUser";

function buildDetailRequest(id: string, cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(`http://localhost/api/registrations/${id}`, { headers });
}

function paramsFor(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/registrations/[id]", () => {
  let db: Client;
  const supabaseAdmin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  let registrationId: string;
  let fotoPath: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  // Every test gets its own freshly seeded row + uploaded photo, so each
  // test is independent (no ordering coupling) even though most of the
  // AC17 assertions don't strictly need this fixture (e.g. AC18 doesn't).
  beforeEach(async () => {
    fotoPath = `detail-fixture-${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("fotos")
      .upload(fotoPath, Buffer.from("fixture-bytes-not-a-real-decodable-jpeg"), {
        contentType: "image/jpeg",
      });
    if (uploadError) {
      throw new Error(`Failed to seed fixture photo: ${uploadError.message}`);
    }

    const { data, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        nome: TEST_NOME,
        telefone: "912345678",
        data_nascimento: "2000-01-01",
        ano_escolar: "9º ano",
        localidade: "Lisboa",
        email: "detail@example.com",
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
    await supabaseAdmin.storage.from("fotos").remove([fotoPath]);
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

  it("AC17: with a valid admin session, returns all fields plus a working signed URL for the photo", async () => {
    const cookie = await validSessionCookiePair();

    const res = await GET(
      buildDetailRequest(registrationId, cookie),
      paramsFor(registrationId),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.id).toBe(registrationId);
    expect(body.nome).toBe(TEST_NOME);
    expect(body.telefone).toBe("912345678");
    expect(body.localidade).toBe("Lisboa");
    expect(body.ano_escolar).toBe("9º ano");
    expect(body.email).toBe("detail@example.com");
    expect(body.status).toBe("pendente");

    expect(typeof body.foto_url).toBe("string");
    // A real Supabase signed URL carries a `token` query param -- this is
    // what distinguishes "short-lived signed URL" from a bare object path
    // or a public-bucket URL.
    expect(new URL(body.foto_url).searchParams.has("token")).toBe(true);

    const download = await fetch(body.foto_url);
    expect(download.status).toBe(200);
  });

  it("AC17 / spec.md §9 risk: the fotos bucket is private -- the same photo path is not fetchable without the signed token", async () => {
    const cookie = await validSessionCookiePair();

    const res = await GET(
      buildDetailRequest(registrationId, cookie),
      paramsFor(registrationId),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Sanity: the returned signed URL really does point at this fixture's
    // object (so the assertion below is about *this* object's privacy, not
    // a coincidentally-missing one).
    expect(new URL(body.foto_url).pathname).toContain(fotoPath);

    const unsignedUrl = `${SUPABASE_URL}/storage/v1/object/public/fotos/${fotoPath}`;
    const unsignedRes = await fetch(unsignedUrl);
    expect(unsignedRes.status).not.toBe(200);
  });

  it("AC18: requesting the detail of a non-existent id returns a 'not found' response naming that no registration exists for that id", async () => {
    const missingId = crypto.randomUUID();
    const cookie = await validSessionCookiePair();

    const res = await GET(buildDetailRequest(missingId, cookie), paramsFor(missingId));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(String(body.error)).toContain(missingId);
    expect(String(body.error).toLowerCase()).toMatch(
      /não encontrado|not found|no such|does not exist/,
    );
  });

  it("rejects a caller with no valid admin session cookie with a 4xx response naming the missing/invalid session (this handler's own check -- middleware.ts is not in the request path when the handler is invoked directly, as here)", async () => {
    const res = await GET(buildDetailRequest(registrationId), paramsFor(registrationId));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/sess|auth|autentic/);
  });
});
