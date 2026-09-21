// @vitest-environment node
//
// Direct database-level tests for lib/registrations/query.ts (sub-task 3).
//
// Covers AC13-AC16 from spec.md §8, all explicitly typed `db` (not `route`):
// exact-match filtering by ano_escolar/status, and case-insensitive
// substring search by localidade/nome. Per this sub-task's testing
// contract, these are exercised directly against the real local
// Postgres/Supabase instance through the query-building unit itself
// (`listRegistrations`), not through the HTTP route layer -- that keeps the
// `db`-typed ACs testing actual database filtering behaviour rather than
// being re-asserted redundantly at the route boundary (AC12/AC17/AC18,
// which *are* typed `route`, are covered in
// app/api/registrations/route.test.ts and
// app/api/registrations/[id]/route.test.ts instead).
//
// Interface decision (not fixed by spec.md/decisions.md, made here as part
// of writing the failing spec): `listRegistrations(supabase, filters?)`
// takes an already-constructed Supabase client (dependency injection) and a
// `RegistrationFilters` object with optional `nome`, `localidade`,
// `ano_escolar`, `status` keys, returning the matching raw rows (no
// computed `idade` -- that composition happens in the route layer via
// lib/registrations/age.ts, per this sub-task's file scope split).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listRegistrations } from "./query";

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

const NOME_PREFIX = "QT ";

interface Fixture {
  nome: string;
  localidade: string;
  ano_escolar: string;
  status: "pendente" | "aprovado" | "rejeitado";
}

// Chosen so cross-field and exact-vs-substring confusions are actually
// exercisable:
//  - row3's *nome* contains "Lisboa" (matches row1's *localidade*) -- proves
//    the localidade filter (AC13) doesn't accidentally match on nome.
//  - row2's *localidade* is "Porto", which row2's *nome* does not contain --
//    proves the nome filter (AC16) doesn't accidentally match on localidade.
//  - "11º ano" contains "1º ano" as a literal substring (`"11º ano"[1:]`),
//    so filtering ano_escolar="1º ano" (AC14) only returning row1 proves
//    exact match, not substring match.
const FIXTURES: Fixture[] = [
  { nome: "QT Maria Silva", localidade: "Lisboa Centro", ano_escolar: "1º ano", status: "pendente" },
  { nome: "QT Mario Souza", localidade: "Porto", ano_escolar: "11º ano", status: "aprovado" },
  { nome: "QT Ana Lisboa", localidade: "Coimbra", ano_escolar: "9º ano", status: "rejeitado" },
  { nome: "QT Bruno Costa", localidade: "Faro", ano_escolar: "9º ano", status: "pendente" },
];

describe("listRegistrations", () => {
  let db: Client;
  let supabase: SupabaseClient;
  const idByNome = new Map<string, string>();

  beforeAll(async () => {
    db = new Client({ connectionString: DB_URL });
    await db.connect();
    supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

    for (const fixture of FIXTURES) {
      const { data, error } = await supabase
        .from("registrations")
        .insert({
          nome: fixture.nome,
          telefone: "912345678",
          data_nascimento: "2000-01-01",
          ano_escolar: fixture.ano_escolar,
          localidade: fixture.localidade,
          foto_path: `query-fixture-${fixture.nome}.jpg`,
          consentimento: true,
          status: fixture.status,
        })
        .select("id")
        .single();
      if (error || !data) {
        throw new Error(`Failed to seed fixture row for ${fixture.nome}: ${error?.message}`);
      }
      idByNome.set(fixture.nome, data.id);
    }
  });

  afterAll(async () => {
    await db.query("delete from public.registrations where nome like $1", [`${NOME_PREFIX}%`]);
    await db.end();
  });

  function idsOf(rows: Array<{ id: string }>): string[] {
    return rows.map((r) => r.id).sort();
  }

  it("AC13: filters by a case-insensitive substring of localidade, matching only rows whose localidade contains it (not rows whose nome happens to contain it)", async () => {
    const rows = await listRegistrations(supabase, { localidade: "lisboa" });

    expect(idsOf(rows)).toEqual(idsOf([{ id: idByNome.get("QT Maria Silva")! }]));
  });

  it("AC14: filters by ano_escolar as an exact match, not a substring match", async () => {
    const rows = await listRegistrations(supabase, { ano_escolar: "1º ano" });

    // "11º ano" (QT Mario Souza) literally contains "1º ano" as a substring;
    // if this were substring matching it would wrongly be included too.
    expect(idsOf(rows)).toEqual(idsOf([{ id: idByNome.get("QT Maria Silva")! }]));
  });

  it("AC15: filters by status, matching only rows whose status matches the selected value", async () => {
    const rows = await listRegistrations(supabase, { status: "pendente" });

    expect(idsOf(rows)).toEqual(
      idsOf([
        { id: idByNome.get("QT Maria Silva")! },
        { id: idByNome.get("QT Bruno Costa")! },
      ]),
    );
  });

  it("AC16: filters by a case-insensitive substring of nome, matching only rows whose nome contains it (not rows whose localidade happens to contain it)", async () => {
    const rows = await listRegistrations(supabase, { nome: "ana" });

    expect(idsOf(rows)).toEqual(idsOf([{ id: idByNome.get("QT Ana Lisboa")! }]));
  });
});
