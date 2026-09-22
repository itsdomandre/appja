import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BackofficePage from "./page";

/**
 * Component tests for the redesigned backoffice listing (sub-task 7, spec.md
 * §8 AC34/AC35/AC37). Co-located with app/backoffice/page.tsx per this
 * project's testing contract; this file didn't exist before this sub-task.
 *
 * `next/navigation`'s `useRouter` isn't mocked anywhere else in the repo
 * (BackofficePage is the first component under test that imports it), so
 * this file provides its own minimal mock, scoped to this file only.
 *
 * Interface/response-shape decisions made here (not fixed by
 * spec.md/decisions.md, as part of writing this failing spec -- the
 * implementer should follow these):
 *  - `GET /api/registrations`, when the page now always requests with
 *    `page`/`limit` (to drive AC35's pagination), responds
 *    `{ registrations: [...], total: number }` (see AC36's route test for
 *    the same shape at the HTTP layer).
 *  - The results-count text (AC34) reads "{n} resultados" (Portuguese,
 *    matching the rest of the app's copy).
 *  - The "next page" control (AC35) is a button whose accessible name
 *    matches /próxima página|next page/i.
 *  - Each row's avatar (AC37) renders the person's initials as its own
 *    visible text (e.g. "JS" for "João Silva"), inside that row.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

interface MockRegistration {
  id: string;
  nome: string;
  localidade: string;
  ano_escolar: string;
  status: string;
  idade: number;
}

let nextId = 0;

function makeRegistration(
  nome: string,
  overrides: Partial<MockRegistration> = {},
): MockRegistration {
  nextId += 1;
  return {
    id: `mock-id-${nextId}`,
    nome,
    localidade: "Lisboa",
    ano_escolar: "9º ano",
    status: "pendente",
    idade: 20,
    ...overrides,
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("BackofficePage", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("AC34: shows a results-count text for the current search/filter, which changes when a filter reduces the result set", async () => {
    const allRows = Array.from({ length: 12 }, (_, i) => makeRegistration(`Pessoa ${i + 1}`));
    allRows[0] = makeRegistration("Ana Souza");
    allRows[1] = makeRegistration("Ana Costa");

    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      const nomeFilter = url.searchParams.get("nome");
      const matches = nomeFilter
        ? allRows.filter((r) => r.nome.toLowerCase().includes(nomeFilter.toLowerCase()))
        : allRows;

      return jsonResponse({ registrations: matches.slice(0, 20), total: matches.length });
    });

    render(<BackofficePage />);

    expect(await screen.findByText(/12 resultados/i)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^nome$/i), "Ana");

    expect(await screen.findByText(/2 resultados/i, {}, { timeout: 2000 })).toBeInTheDocument();

    fetchMock.mockRestore();
  });

  it("AC35: shows at most 20 rows per page, and a control to load the next page of results", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) =>
      makeRegistration(`Pessoa ${String(i + 1).padStart(2, "0")}`),
    );
    const page2 = Array.from({ length: 5 }, (_, i) =>
      makeRegistration(`Pessoa ${String(i + 21).padStart(2, "0")}`),
    );

    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = new URL(String(input), "http://localhost");
      const requestedPage = Number(url.searchParams.get("page") ?? "1");
      const rows = requestedPage >= 2 ? page2 : page1;
      return jsonResponse({ registrations: rows, total: 25 });
    });

    render(<BackofficePage />);

    await screen.findByText("Pessoa 01");
    expect(screen.getAllByRole("link", { name: /^Pessoa \d+$/ })).toHaveLength(20);

    await userEvent.click(screen.getByRole("button", { name: /próxima página|next page/i }));

    await screen.findByText("Pessoa 21");
    expect(screen.queryByText("Pessoa 01")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Pessoa \d+$/ })).toHaveLength(5);

    fetchMock.mockRestore();
  });

  it("AC37: shows each row's person as a circular avatar with their initials (e.g. 'João Silva' -> 'JS')", async () => {
    const rows = [makeRegistration("João Silva"), makeRegistration("Maria Souza", { status: "aprovado" })];

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue(jsonResponse({ registrations: rows, total: rows.length }));

    render(<BackofficePage />);

    const joaoRow = await screen.findByRole("row", { name: /João Silva/ });
    expect(within(joaoRow).getByText("JS")).toBeInTheDocument();

    const mariaRow = screen.getByRole("row", { name: /Maria Souza/ });
    expect(within(mariaRow).getByText("MS")).toBeInTheDocument();

    fetchMock.mockRestore();
  });
});
