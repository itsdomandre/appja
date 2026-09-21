import { test, expect } from "@playwright/test";

/**
 * Sub-task 5 (spec.md §8, AC24/AC25): proves the already-built, already
 * locally-tested app (sub-tasks 1-4) behaves correctly once actually
 * deployed to production (Vercel + Supabase, §7). This introduces no new
 * application behaviour — it only exercises the deployed environment.
 *
 * These specs must run against a real deployed URL, not the local dev
 * server. `playwright.config.ts` falls back to `http://127.0.0.1:3000` (and
 * boots one via its `webServer` block) whenever `PLAYWRIGHT_BASE_URL` is
 * unset, which would let a "production" assertion coincidentally pass
 * against a machine that was never deployed anywhere. To keep that from
 * happening, every test here first resolves and validates
 * `PLAYWRIGHT_BASE_URL` itself (ignoring the config's localhost fallback)
 * and fails with an explicit message if it is missing or points at a local
 * host, before touching the network.
 */

function resolveProductionBaseURL(): string {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL;

  if (!baseURL) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL is not set. AC24/AC25 assert the behaviour of the deployed " +
        "production environment (specs/registration-backoffice/spec.md §8), not the local dev " +
        "server that playwright.config.ts's webServer block falls back to. Set " +
        "PLAYWRIGHT_BASE_URL to the real deployed URL (e.g. the Vercel production domain) " +
        "before running these tests.",
    );
  }

  let hostname: string;
  try {
    hostname = new URL(baseURL).hostname;
  } catch {
    throw new Error(`PLAYWRIGHT_BASE_URL ("${baseURL}") is not a valid absolute URL.`);
  }

  const isLocalHost =
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (isLocalHost) {
    throw new Error(
      `PLAYWRIGHT_BASE_URL ("${baseURL}") points at a local host. AC24/AC25 exist to prove the ` +
        "deployed production environment works, not the local dev server. Set " +
        "PLAYWRIGHT_BASE_URL to the real deployed URL (e.g. the Vercel production domain).",
    );
  }

  return baseURL;
}

test.describe("production deployment", () => {
  test("AC24 — GET /cadastro responds 200 and renders the registration form", async ({
    page,
  }) => {
    const baseURL = resolveProductionBaseURL();

    const response = await page.goto(new URL("/cadastro", baseURL).toString());

    expect(response?.status()).toBe(200);

    await expect(page.getByLabel("Nome")).toBeVisible();
    await expect(page.getByLabel("Telefone")).toBeVisible();
    await expect(page.getByLabel("Data de nascimento")).toBeVisible();
    await expect(page.getByLabel("Ano escolar")).toBeVisible();
    await expect(page.getByLabel("Localidade")).toBeVisible();
    await expect(page.getByLabel("Foto")).toBeVisible();
    await expect(page.getByLabel("Consentimento")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submeter" })).toBeVisible();
  });

  test("AC25 — accessing /backoffice without authentication redirects to /backoffice/login", async ({
    page,
  }) => {
    const baseURL = resolveProductionBaseURL();

    await page.goto(new URL("/backoffice", baseURL).toString());

    await expect(page).toHaveURL(/\/backoffice\/login$/);
    await expect(page.getByRole("heading", { name: "Acesso ao backoffice" })).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });
});
