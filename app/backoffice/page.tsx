"use client";

/**
 * Backoffice listing/search page (spec.md §5.2 use case 3; restyled +
 * paginated for sub-task 7, spec.md §8 AC32, AC34, AC35, AC37).
 *
 * Fetches `GET /api/registrations` with the current filter state plus
 * `page`/`limit` (AC36's paginated response shape --
 * `{ registrations: [...], total }`), renders each row with its computed
 * `idade`, an initials avatar, a colored status badge, and links through to
 * the detail page. Shows a "{n} resultados" count (AC34) and, when there's
 * more than one page, a "Próxima página" control that loads and replaces
 * the shown rows with the next page (AC35).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { initials } from "@/lib/initials";
import { ANO_ESCOLAR_OPTIONS, STATUS_OPTIONS, type Status } from "@/lib/validation/registration";
import Topbar from "@/components/Topbar";

/** Debounce delay for the free-text `nome`/`localidade` filters, so a fetch
 * isn't fired on every keystroke. Select filters (`ano_escolar`/`status`)
 * change less often and don't need debouncing. */
const TEXT_FILTER_DEBOUNCE_MS = 300;

/** Page size for the admin listing (spec.md §8 AC35, decision confirmed
 * with the stakeholder in specs/registration-backoffice/decisions.md). */
const PAGE_SIZE = 20;

interface RegistrationListItem {
  id: string;
  nome: string;
  telefone: string;
  localidade: string;
  ano_escolar: string;
  status: Status;
  idade: number;
}

type LoadStatus = "idle" | "loading" | "error";

export default function BackofficePage() {
  const router = useRouter();
  // Held in a ref (not used directly as an effect dependency below) because
  // next/navigation's useRouter() return value isn't guaranteed referentially
  // stable across renders (e.g. this test suite's own minimal mock -- see
  // app/backoffice/page.test.tsx -- returns a fresh object every call);
  // including it directly in the fetch effect's dependency array would
  // re-run that effect (and re-fetch) on every render, not just on real
  // filter/page changes.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const [nome, setNome] = useState("");
  const [localidade, setLocalidade] = useState("");
  const [anoEscolar, setAnoEscolar] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [registrations, setRegistrations] = useState<RegistrationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nomeId = useId();
  const localidadeId = useId();
  const anoEscolarId = useId();
  const statusId = useId();

  // Debounces the free-text filters so a fetch isn't fired on every
  // keystroke; the effect below re-runs (and re-fetches) once they settle.
  // Resetting `page` here (batched with the debounced value update) means a
  // filter change always starts back at page 1.
  const [debouncedNome, setDebouncedNome] = useState(nome);
  const [debouncedLocalidade, setDebouncedLocalidade] = useState(localidade);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedNome(nome);
      setPage(1);
    }, TEXT_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [nome]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedLocalidade(localidade);
      setPage(1);
    }, TEXT_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [localidade]);

  // Re-fetches whenever a (debounced) filter or the current page changes;
  // the "Buscar" button below is a convenience for keyboard/form-submit
  // users (preventing a full page navigation) rather than a strictly
  // necessary trigger, since the filter state change alone already re-runs
  // this effect.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadStatus("loading");
      setErrorMessage(null);

      const params = new URLSearchParams();
      if (debouncedNome.trim()) params.set("nome", debouncedNome.trim());
      if (debouncedLocalidade.trim()) params.set("localidade", debouncedLocalidade.trim());
      if (anoEscolar) params.set("ano_escolar", anoEscolar);
      if (status) params.set("status", status);
      params.set("page", String(page));
      params.set("limit", String(PAGE_SIZE));

      const query = params.toString();

      try {
        const response = await fetch(`/api/registrations?${query}`);
        if (cancelled) return;

        // middleware.ts redirects unauthenticated requests to
        // /api/registrations to /backoffice/login; fetch() follows that
        // same-origin redirect and yields a 200 HTML response here instead
        // of the route handler's 401 JSON. Detect that (via
        // response.redirected and/or a non-JSON content type) and send the
        // browser to the login page instead of trying to parse HTML as JSON.
        const contentType = response.headers.get("content-type") ?? "";
        if (response.redirected || !contentType.includes("application/json")) {
          routerRef.current.replace("/backoffice/login");
          return;
        }

        const body = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          setLoadStatus("error");
          setErrorMessage(String(body.error ?? "Não foi possível carregar os cadastros."));
          setRegistrations([]);
          setTotal(0);
          return;
        }

        const nextRegistrations = (body as { registrations: unknown }).registrations;
        if (!Array.isArray(nextRegistrations)) {
          setLoadStatus("error");
          setErrorMessage("Não foi possível carregar os cadastros.");
          setRegistrations([]);
          setTotal(0);
          return;
        }

        setRegistrations(nextRegistrations as RegistrationListItem[]);
        const nextTotal = (body as { total?: unknown }).total;
        setTotal(typeof nextTotal === "number" ? nextTotal : nextRegistrations.length);
        setLoadStatus("idle");
      } catch {
        if (!cancelled) {
          setLoadStatus("error");
          setErrorMessage("Não foi possível carregar os cadastros.");
          setRegistrations([]);
          setTotal(0);
        }
      }
    }

    load().catch((err) => {
      console.error("Unexpected error while loading registrations:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedNome, debouncedLocalidade, anoEscolar, status, page]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  function onAnoEscolarChange(value: string) {
    setAnoEscolar(value);
    setPage(1);
  }

  function onStatusChange(value: string) {
    setStatus(value);
    setPage(1);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasNextPage = page < totalPages;

  return (
    <>
      <Topbar showLogout />
      <main>
        <h1>Backoffice — cadastros</h1>

        <form
          onSubmit={onSubmit}
          className="mb-6 grid grid-cols-1 gap-4 rounded-2xl border border-gray-200 bg-white p-5
            shadow-sm sm:grid-cols-2 lg:grid-cols-5"
        >
          <div className="form-field">
            <label htmlFor={nomeId}>Nome</label>
            <input
              id={nomeId}
              type="text"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Buscar por nome"
            />
          </div>

          <div className="form-field">
            <label htmlFor={localidadeId}>Localidade</label>
            <input
              id={localidadeId}
              type="text"
              value={localidade}
              onChange={(event) => setLocalidade(event.target.value)}
              placeholder="Buscar por localidade"
            />
          </div>

          <div className="form-field">
            <label htmlFor={anoEscolarId}>Ano escolar</label>
            <select
              id={anoEscolarId}
              value={anoEscolar}
              onChange={(event) => onAnoEscolarChange(event.target.value)}
            >
              <option value="">Todos</option>
              {ANO_ESCOLAR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor={statusId}>Status</label>
            <select
              id={statusId}
              value={status}
              onChange={(event) => onStatusChange(event.target.value)}
            >
              <option value="">Todos</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={loadStatus === "loading"}>
              Buscar
            </button>
          </div>
        </form>

        <p className="mb-3 text-sm text-gray-600">{total} resultados</p>

        {loadStatus === "error" && errorMessage && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {errorMessage}
          </p>
        )}

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full">
            <thead className="bg-gray-50/70">
              <tr>
                <th scope="col" className="w-14 px-4 py-3">
                  <span className="sr-only">Avatar</span>
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide
                    text-gray-500"
                >
                  Nome
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide
                    text-gray-500"
                >
                  Idade
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide
                    text-gray-500"
                >
                  Localidade
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide
                    text-gray-500"
                >
                  Ano escolar
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide
                    text-gray-500"
                >
                  Telefone
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registrations.map((registration) => (
                <tr key={registration.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200
                        text-xs font-semibold text-gray-700"
                    >
                      {initials(registration.nome)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Link
                      href={`/backoffice/${registration.id}`}
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {registration.nome}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">{registration.idade}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{registration.localidade}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{registration.ano_escolar}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{registration.telefone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loadStatus === "idle" && registrations.length === 0 && (
          <p className="mt-4 text-sm text-gray-600">Nenhum cadastro encontrado.</p>
        )}

        {hasNextPage && (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={loadStatus === "loading"}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium
                text-gray-700 shadow-sm transition-colors hover:bg-gray-50
                disabled:cursor-not-allowed disabled:opacity-60"
            >
              Próxima página
            </button>
          </div>
        )}
      </main>
    </>
  );
}
