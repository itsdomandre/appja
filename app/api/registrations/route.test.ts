// @vitest-environment node
//
// Route + integration tests for POST /api/registrations.
//
// These run against a REAL local Supabase/Postgres instance (see
// supabase/config.toml + supabase/migrations/0001_create_registrations.sql,
// started with `npx supabase start`). We assert DB/storage state directly
// via `pg` and the Supabase service-role client so these tests do not rely
// on the (stub) implementation being wired up correctly — only on the
// route handler's actual HTTP response and the actual database/storage
// contents.
//
// Covers AC1-AC8, AC26, AC28 (route) and AC7, AC29 (integration).
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { POST } from "./route";

const DB_URL = process.env.SUPABASE_DB_URL;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!DB_URL || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_DB_URL / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. " +
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
