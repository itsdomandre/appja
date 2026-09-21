import { test, expect, type Page } from "@playwright/test";

/**
 * Sub-task 6 (spec.md §8, AC30/AC31): proves a real, shared stylesheet has
 * been loaded and applied to the public /cadastro form and the
 * /backoffice/login page — not bare unstyled HTML, and not ad-hoc,
 * divergent per-page styles.
 *
 * Runs against the local dev server via playwright.config.ts's `webServer`
 * block (default baseURL http://127.0.0.1:3000) — unlike
 * tests/e2e/production.spec.ts, this is about the app's own visual
 * behaviour, not about a deployed environment, so it deliberately does not
 * require PLAYWRIGHT_BASE_URL.
 *
 * Chromium's actual computed `background-color` for a plain, unstyled
 * `<button>` was measured directly (via a real Playwright run against this
 * app, before any CSS existed anywhere in the project) to be
 * `rgb(239, 239, 239)` — the browser's default ButtonFace grey, not the
 * commonly assumed `rgba(0, 0, 0, 0)`. That measured value is the ground
 * truth for "unstyled browser default" used below.
 */
const UNSTYLED_BUTTON_BACKGROUND_COLOR = "rgb(239, 239, 239)";

async function getButtonBackgroundColor(page: Page, name: string): Promise<string> {
  return page.getByRole("button", { name }).evaluate((el) => getComputedStyle(el).backgroundColor);
}

test.describe("shared visual styling", () => {
  test("AC30 — /cadastro Submeter button background-color differs from the unstyled browser default", async ({
    page,
  }) => {
    await page.goto("/cadastro");

    const backgroundColor = await getButtonBackgroundColor(page, "Submeter");

    expect(backgroundColor).not.toBe(UNSTYLED_BUTTON_BACKGROUND_COLOR);
  });

  test("AC31 — /backoffice/login Entrar button shares the same, non-default background-color as /cadastro's Submeter button", async ({
    page,
  }) => {
    await page.goto("/cadastro");
    const submeterColor = await getButtonBackgroundColor(page, "Submeter");

    await page.goto("/backoffice/login");
    const entrarColor = await getButtonBackgroundColor(page, "Entrar");

    // Guard against a coincidental pass: today, with zero CSS, BOTH buttons
    // compute the same *unstyled default* background-color, so a bare
    // "same as each other" assertion would pass for the wrong reason. Require
    // the shared color to also be a real, non-default style, so this test can
    // only pass once genuine shared styling exists.
    expect(entrarColor).not.toBe(UNSTYLED_BUTTON_BACKGROUND_COLOR);
    expect(entrarColor).toBe(submeterColor);
  });
});
