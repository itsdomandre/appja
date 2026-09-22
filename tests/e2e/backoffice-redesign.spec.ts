import dotenv from "dotenv";

dotenv.config({ path: ".env.test" });

import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Sub-task 7 (spec.md §8, AC32/AC33): proves the shared backoffice
 * navigation shell (topbar) and the colored status badges introduced by the
 * Tailwind redesign are real, rendered, computed styles -- not just markup.
 *
 * Kept in its own file (not tests/e2e/styling.spec.ts, sub-task 6's already
 * certified artifact) per this sub-task's instructions.
 *
 * Unlike sub-task 6's AC30/AC31 (unauthenticated pages only), both ACs here
 * need real, authenticated access to /backoffice and /backoffice/[id], and
 * AC33 needs real rows in the database with two different statuses. That
 * means this file, unlike styling.spec.ts, needs the local Supabase stack's
 * credentials -- loaded here directly via dotenv from .env.test (mirroring
 * vitest.setup.ts), since Playwright spec files run as plain Node processes
 * with no equivalent setup file of their own. Note this also means the
 * `next dev` process spawned by playwright.config.ts's `webServer` block
 * must itself have these same env vars available (e.g. exported in the
 * shell before `npx playwright test` runs) for the login step below to
 * actually succeed once the redesign is implemented -- a pre-existing
 * local-dev setup requirement, not something introduced by these tests.
 *
 * Interface decisions made here (not fixed by spec.md/decisions.md, as part
 * of writing this failing spec):
 *  - The shared topbar (components/Topbar.tsx) renders as a native `<header>`
 *    element (the "banner" landmark role), containing the app name "Raio"
 *    (matching app/layout.tsx's `metadata.title`) as visible text.
 *  - Each status badge renders the status value itself ("pendente"/
 *    "aprovado"/"rejeitado") as its own visible text, inside the table row
 *    for that registration -- so it can be located, per row, via the
 *    existing nome-based row scoping without any new test-id attributes.
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_PASSWORD) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ADMIN_PASSWORD. Start the local " +
      "Supabase stack with `npx supabase start` and ensure .env.test is present (see " +
      "vitest.setup.ts, mirrored above for this Playwright spec via dotenv).",
  );
}

const supabaseAdmin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

interface SeedOverrides {
  nome: string;
  status?: "pendente" | "aprovado" | "rejeitado";
}

async function seedRegistration(overrides: SeedOverrides): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("registrations")
    .insert({
      nome: overrides.nome,
      telefone: "912345678",
      data_nascimento: "2000-01-01",
      ano_escolar: "9º ano",
      localidade: "Lisboa",
      foto_path: `backoffice-redesign-fixture-${overrides.nome}.jpg`,
      consentimento: true,
      status: overrides.status ?? "pendente",
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`Failed to seed fixture registration "${overrides.nome}": ${error?.message}`);
  }
  return data.id as string;
}

async function cleanupRegistration(nome: string): Promise<void> {
  await supabaseAdmin.from("registrations").delete().eq("nome", nome);
}

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/backoffice/login");
  await page.getByLabel("Senha").fill(ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/backoffice$/);
}

async function getTopbarBackgroundColor(page: Page): Promise<string> {
  return page.getByRole("banner").evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.describe("backoffice redesign — shared shell and status badges", () => {
  test("AC32 — a topbar with the app name is present on /backoffice/login, /backoffice, and /backoffice/[id], with the same computed background-color on all three", async ({
    page,
  }) => {
    const nome = `AC32 Detail Person ${Date.now()}`;
    const id = await seedRegistration({ nome });

    try {
      await page.goto("/backoffice/login");
      await expect(page.getByRole("banner")).toContainText("Raio");
      const loginColor = await getTopbarBackgroundColor(page);

      await loginAsAdmin(page);
      await expect(page.getByRole("banner")).toContainText("Raio");
      const listColor = await getTopbarBackgroundColor(page);

      await page.goto(`/backoffice/${id}`);
      await expect(page.getByRole("banner")).toContainText("Raio");
      const detailColor = await getTopbarBackgroundColor(page);

      expect(listColor).toBe(loginColor);
      expect(detailColor).toBe(loginColor);
    } finally {
      await cleanupRegistration(nome);
    }
  });

  test("AC33 — status badges for pendente and aprovado registrations have different computed background-colors", async ({
    page,
  }) => {
    const marker = `AC33 ${Date.now()}`;
    const pendenteNome = `${marker} Pendente`;
    const aprovadoNome = `${marker} Aprovado`;

    await seedRegistration({ nome: pendenteNome, status: "pendente" });
    await seedRegistration({ nome: aprovadoNome, status: "aprovado" });

    try {
      await loginAsAdmin(page);

      // Scope the listing to just these two seeded rows via the existing
      // nome substring filter (AC16), so unrelated pre-existing data in the
      // local database can't interfere with the assertion below.
      await page.getByLabel("Nome").fill(marker);

      const pendenteRow = page.getByRole("row", { name: new RegExp(pendenteNome) });
      const aprovadoRow = page.getByRole("row", { name: new RegExp(aprovadoNome) });
      await expect(pendenteRow).toBeVisible();
      await expect(aprovadoRow).toBeVisible();

      const pendenteBadgeColor = await pendenteRow
        .getByText("pendente", { exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor);
      const aprovadoBadgeColor = await aprovadoRow
        .getByText("aprovado", { exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor);

      expect(pendenteBadgeColor).not.toBe(aprovadoBadgeColor);
    } finally {
      await cleanupRegistration(pendenteNome);
      await cleanupRegistration(aprovadoNome);
    }
  });
});
