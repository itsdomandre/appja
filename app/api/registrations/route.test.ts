// @vitest-environment node
//
// Route + integration tests for POST /api/registrations and GET
// /api/registrations.
//
// These run against a REAL local Supabase/Postgres instance (see
// supabase/config.toml + supabase/migrations/0001_create_registrations.sql,
// started with `npx supabase start`). We assert DB/storage state directly
// via `pg` and the Supabase service-role client so these tests do not rely
// on the (stub) implementation being wired up correctly — only on the
// route handler's actual HTTP response and the actual database/storage
// contents.
//
// Covers AC1-AC8, AC26, AC28 (route), AC7, AC29 (integration), and AC12
// (route, GET /api/registrations — list including computed `idade`).
//
// GET is added to the *existing* POST test module here per sub-task 3's
// scope ("adiciona GET ao arquivo já criado na sub-tarefa 1"). The existing
// POST describe block/tests below are untouched.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { GET, POST } from "./route";
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

const TEST_NOME = "Maria Silva";

type FormOverrides = Partial<{
  nome: string | null;
  telefone: string | null;
  data_nascimento: string | null;
  ano_escolar: string | null;
  localidade: string | null;
  email: string | null;
  instagram: string | null;
  tiktok: string | null;
  observacoes: string | null;
  consentimento: string | null;
  foto: File | null;
}>;

// Populated in beforeAll with a genuinely decodable JPEG (a tiny solid-color
// image) so implementations that decode the upload (e.g. to resize/recompress
// it) don't reject it as corrupt.
let defaultFotoBytes: Buffer;

function defaultFoto(): File {
  if (!defaultFotoBytes) {
    throw new Error("defaultFotoBytes not initialized; expected beforeAll to have run first");
  }
  return new File([defaultFotoBytes], "foto.jpg", {
    type: "image/jpeg",
  });
}

function buildFormData(overrides: FormOverrides = {}): FormData {
  const { foto: fotoOverride, ...fieldOverrides } = overrides;
  const defaults: Record<string, string> = {
    nome: TEST_NOME,
    telefone: "912345678",
    data_nascimento: "2005-04-12",
    ano_escolar: "9º ano",
    localidade: "Lisboa",
    consentimento: "true",
  };

  const fd = new FormData();
  const merged: Record<string, string | null | undefined> = { ...defaults, ...fieldOverrides };
  for (const [key, value] of Object.entries(merged)) {
    if (value === null || value === undefined) continue;
    fd.set(key, value);
  }

  const foto = "foto" in overrides ? fotoOverride : defaultFoto();
  if (foto) {
    fd.set("foto", foto);
  }

  return fd;
}

function buildRequest(formData: FormData): Request {
  return new Request("http://localhost/api/registrations", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/registrations", () => {
  let db: Client;
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();

    defaultFotoBytes = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    await db.end();
  });

  afterEach(async () => {
    await db.query("delete from public.registrations where nome = $1", [TEST_NOME]);
  });

  async function countRegistrations(): Promise<number> {
    const { rows } = await db.query<{ count: number }>(
      "select count(*)::int as count from public.registrations",
    );
    return rows[0].count;
  }

  it("AC1: creates a pendente row with the exact submitted values when all required fields and a photo are provided", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData()));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe("pendente");

    expect(await countRegistrations()).toBe(before + 1);

    const { rows } = await db.query(
      "select nome, telefone, data_nascimento, ano_escolar, localidade, status from public.registrations where id = $1",
      [body.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].nome).toBe(TEST_NOME);
    expect(rows[0].telefone).toBe("912345678");
    expect(rows[0].ano_escolar).toBe("9º ano");
    expect(rows[0].localidade).toBe("Lisboa");
    expect(rows[0].status).toBe("pendente");
  });

  it("AC2: rejects a submission missing a required field (nome) with 400 naming the missing field, and creates no row", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData({ nome: null })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("nome");
    expect(await countRegistrations()).toBe(before);
  });

  it("AC3: rejects an invalid telefone (must match ^9\\d{8}$) with 400 naming telefone, and creates no row", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData({ telefone: "812345678" })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("telefone");
    expect(await countRegistrations()).toBe(before);
  });

  it("AC4: rejects an ano_escolar outside the fixed list with 400 naming ano_escolar", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData({ ano_escolar: "13º ano" })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("ano_escolar");
    expect(await countRegistrations()).toBe(before);
  });

  it("AC5: rejects an empty localidade with 400 naming localidade as required, and creates no row", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData({ localidade: "" })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("localidade");
    expect(await countRegistrations()).toBe(before);
  });

  it("AC6: rejects a submission without a photo with 400 naming foto as required, and creates no row", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData({ foto: null })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error)).toContain("foto");
    expect(await countRegistrations()).toBe(before);
  });

  it("AC8: creates a row with null optional columns when email/instagram/tiktok/observacoes are omitted", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData()));

    expect(res.status).toBe(201);
    const body = await res.json();

    const { rows } = await db.query(
      "select email, instagram, tiktok, observacoes from public.registrations where id = $1",
      [body.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ email: null, instagram: null, tiktok: null, observacoes: null });
    expect(await countRegistrations()).toBe(before + 1);
  });

  it("AC26: rejects a submission without consent checked with 400 naming consent as required, and creates no row", async () => {
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData({ consentimento: null })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain("consent");
    expect(await countRegistrations()).toBe(before);
  });

  it("AC28: rejects a photo larger than 20MB with 400 naming the file size as invalid, and creates no row", async () => {
    const oversized = new File([Buffer.alloc(20 * 1024 * 1024 + 1)], "big.jpg", {
      type: "image/jpeg",
    });
    const before = await countRegistrations();

    const res = await POST(buildRequest(buildFormData({ foto: oversized })));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toContain("foto");
    expect(await countRegistrations()).toBe(before);
  });

  it("AC7 (integration): uploads the photo to the private fotos bucket and stores its path on the created row", async () => {
    const res = await POST(buildRequest(buildFormData()));

    expect(res.status).toBe(201);
    const body = await res.json();

    const { rows } = await db.query("select foto_path from public.registrations where id = $1", [
      body.id,
    ]);
    expect(rows).toHaveLength(1);
    const fotoPath: string = rows[0].foto_path;
    expect(fotoPath).toBeTruthy();

    const { data, error } = await supabaseAdmin.storage.from("fotos").download(fotoPath);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
  });

  it("AC29 (integration): stores an accepted large photo strictly smaller, in bytes, than the original upload", async () => {
    // A genuinely decodable JPEG, large in both pixel dimensions (well over
    // the 1600px resize target) and encoded byte size (high-entropy noise at
    // high quality, ~4.5MB, well within the 20MB limit), so a real
    // resize+recompress implementation has real work to do and can be
    // expected to shrink it.
    const width = 2400;
    const height = 2400;
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels);
    for (let i = 0; i < raw.length; i++) {
      raw[i] = Math.floor(Math.random() * 256);
    }
    const original = await sharp(raw, { raw: { width, height, channels } })
      .jpeg({ quality: 90 })
      .toBuffer();
    const file = new File([original], "large.jpg", { type: "image/jpeg" });

    const res = await POST(buildRequest(buildFormData({ foto: file })));

    expect(res.status).toBe(201);
    const body = await res.json();

    const { rows } = await db.query("select foto_path from public.registrations where id = $1", [
      body.id,
    ]);
    expect(rows).toHaveLength(1);
    const fotoPath: string = rows[0].foto_path;

    const { data, error } = await supabaseAdmin.storage.from("fotos").download(fotoPath);
    expect(error).toBeNull();
    const storedSize = (await data!.arrayBuffer()).byteLength;
    expect(storedSize).toBeLessThan(original.byteLength);
  });
});

// GET /api/registrations (admin list, sub-task 3) is deliberately a separate
// `describe` with its own setup/teardown rather than reusing the POST block's
// `db`/`supabaseAdmin`/`defaultFotoBytes` (those are scoped inside the POST
// describe above) -- this keeps the two describes independent (no ordering
// coupling between sibling describes) at the cost of a little duplicated
// pg/Supabase-admin-client boilerplate, called out in the report.
//
// Response shape decision (not fixed by spec.md/decisions.md, made here as
// part of writing the failing spec, same as admin/login/route.test.ts did for
// its request body shape): GET /api/registrations responds 200 with
// `{ registrations: [...] }`, where each item carries the stored columns plus
// a computed `idade` (never a stored column -- spec.md §5.1, §8 AC12).
//
// AC13-AC16 (search/filter by localidade/ano_escolar/status/nome) are typed
// `db` in spec.md §8, not `route` -- they are covered directly against the
// real database via lib/registrations/query.test.ts instead of duplicating
// that coverage here through the HTTP layer.
describe("GET /api/registrations", () => {
  let db: Client;
  const supabaseAdmin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);
  const GET_TEST_NOME = "GetList TestUser";
  let insertedId: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();

    const { data, error } = await supabaseAdmin
      .from("registrations")
      .insert({
        nome: GET_TEST_NOME,
        telefone: "912345678",
        // Born Jan 1st: whatever day this test happens to run, that
        // birthday has necessarily already occurred this year, so the
        // expected age is exactly `currentYear - 2000` with no ambiguity
        // about whether the birthday has "passed yet" -- deterministic
        // without freezing/injecting the clock (see AC12 assertion below).
        data_nascimento: "2000-01-01",
        ano_escolar: "9º ano",
        localidade: "Lisboa",
        foto_path: "get-list-fixture.jpg",
        consentimento: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      throw new Error(`Failed to seed GET /api/registrations fixture row: ${error?.message}`);
    }
    insertedId = data.id;
  });

  afterAll(async () => {
    await db.query("delete from public.registrations where nome = $1", [GET_TEST_NOME]);
    await db.end();
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

  it("AC12: with a valid admin session, the list includes the registration with an idade computed from data_nascimento, not a stored column", async () => {
    const cookie = await validSessionCookiePair();

    const res = await GET(
      new Request("http://localhost/api/registrations", { headers: { cookie } }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.registrations)).toBe(true);

    const entry = (body.registrations as Array<{ id: string; nome: string; idade: number }>).find(
      (r) => r.id === insertedId,
    );
    expect(entry).toBeTruthy();
    expect(entry!.nome).toBe(GET_TEST_NOME);

    const expectedAge = new Date().getFullYear() - 2000;
    expect(entry!.idade).toBe(expectedAge);
  });

  it("rejects a caller with no valid admin session cookie with a 4xx response naming the missing/invalid session (this handler's own check -- middleware.ts is not in the request path when the handler is invoked directly, as here)", async () => {
    const res = await GET(new Request("http://localhost/api/registrations"));

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/sess|auth|autentic/);
  });

  // AC36 (spec.md §8, sub-task 7): GET /api/registrations accepts optional
  // `page`/`limit` params; when provided, the response also includes the
  // total count of rows matching the current filters. Self-contained (own
  // seed + cleanup within each `it`, via the `db`/`supabaseAdmin` already in
  // this describe's scope) rather than relying on the single-row fixture
  // seeded by this describe's own `beforeAll` above, since exercising the
  // page-size boundary needs more than one page's worth of rows (>20).
  //
  // Response shape decision (not fixed by spec.md/decisions.md, made here as
  // part of writing the failing spec, same as the unpaginated shape decided
  // above): with `page`/`limit`, GET /api/registrations responds 200 with
  // `{ registrations: [...], total: number }`, where `total` is the count of
  // all rows matching the current filters (not just the requested page).
  it("AC36: with page/limit provided, returns the requested page's rows plus the total count of all rows matching the current filters", async () => {
    const cookie = await validSessionCookiePair();
    const PAGINATION_NOME_PREFIX = `GetList Page ${Date.now()}`;
    const seedRows = Array.from({ length: 25 }, (_, i) => ({
      nome: `${PAGINATION_NOME_PREFIX} ${String(i + 1).padStart(2, "0")}`,
      telefone: "912345678",
      data_nascimento: "2000-01-01",
      ano_escolar: "9º ano",
      localidade: "Lisboa",
      foto_path: `pagination-fixture-${i + 1}.jpg`,
      consentimento: true,
      status: "pendente",
    }));

    const { error: seedError } = await supabaseAdmin.from("registrations").insert(seedRows);
    if (seedError) {
      throw new Error(`Failed to seed AC36 pagination fixture rows: ${seedError.message}`);
    }

    try {
      const nomeParam = encodeURIComponent(PAGINATION_NOME_PREFIX);

      const page1Res = await GET(
        new Request(
          `http://localhost/api/registrations?nome=${nomeParam}&page=1&limit=20`,
          { headers: { cookie } },
        ),
      );
      expect(page1Res.status).toBe(200);
      const page1Body = await page1Res.json();
      expect(Array.isArray(page1Body.registrations)).toBe(true);
      expect(page1Body.registrations).toHaveLength(20);
      expect(page1Body.total).toBe(25);

      const page2Res = await GET(
        new Request(
          `http://localhost/api/registrations?nome=${nomeParam}&page=2&limit=20`,
          { headers: { cookie } },
        ),
      );
      expect(page2Res.status).toBe(200);
      const page2Body = await page2Res.json();
      expect(Array.isArray(page2Body.registrations)).toBe(true);
      expect(page2Body.registrations).toHaveLength(5);
      expect(page2Body.total).toBe(25);

      const allIds = new Set([
        ...(page1Body.registrations as Array<{ id: string }>).map((r) => r.id),
        ...(page2Body.registrations as Array<{ id: string }>).map((r) => r.id),
      ]);
      expect(allIds.size).toBe(25);
    } finally {
      await db.query("delete from public.registrations where nome like $1", [
        `${PAGINATION_NOME_PREFIX}%`,
      ]);
    }
  });

  it("AC36: without page/limit, keeps the existing full-list behaviour (AC12-AC16 -- no total field, no page slicing)", async () => {
    const cookie = await validSessionCookiePair();

    const res = await GET(
      new Request(
        `http://localhost/api/registrations?nome=${encodeURIComponent(GET_TEST_NOME)}`,
        { headers: { cookie } },
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.registrations)).toBe(true);
    expect(
      (body.registrations as Array<{ id: string }>).some((r) => r.id === insertedId),
    ).toBe(true);
    expect(body.total).toBeUndefined();
  });
});
