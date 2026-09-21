"use client";

/**
 * Backoffice listing/search page (spec.md §5.2 use case 3). Fetches
 * `GET /api/registrations` with the current filter state, renders each row
 * with its computed `idade`, and links through to the detail page. Not
 * directly asserted by any test -- a minimal functional page built against
 * the response shape `GET /api/registrations` returns
 * (`{ registrations: [...] }`, per app/api/registrations/route.test.ts).
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { ANO_ESCOLAR_OPTIONS, STATUS_OPTIONS } from "@/lib/validation/registration";

/** Debounce delay for the free-text `nome`/`localidade` filters, so a fetch
 * isn't fired on every keystroke. Select filters (`ano_escolar`/`status`)
 * change less often and don't need debouncing. */
const TEXT_FILTER_DEBOUNCE_MS = 300;

interface RegistrationListItem {
  id: string;
  nome: string;
  localidade: string;
  ano_escolar: string;
  status: string;
  idade: number;
}

type LoadStatus = "idle" | "loading" | "error";

export default function BackofficePage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [localidade, setLocalidade] = useState("");
  const [anoEscolar, setAnoEscolar] = useState("");
  const [status, setStatus] = useState("");

  const [registrations, setRegistrations] = useState<RegistrationListItem[]>([]);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nomeId = useId();
  const localidadeId = useId();
  const anoEscolarId = useId();
  const statusId = useId();

  // Debounces the free-text filters so a fetch isn't fired on every
  // keystroke; the effect below re-runs (and re-fetches) once they settle.
  const [debouncedNome, setDebouncedNome] = useState(nome);
  const [debouncedLocalidade, setDebouncedLocalidade] = useState(localidade);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedNome(nome), TEXT_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [nome]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedLocalidade(localidade), TEXT_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [localidade]);

  // Re-fetches whenever a (debounced) filter changes; the "Buscar" button
  // below is a convenience for keyboard/form-submit users (preventing a
  // full page navigation) rather than a strictly necessary trigger, since
  // the filter state change alone already re-runs this effect.
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

      const query = params.toString();

      try {
        const response = await fetch(`/api/registrations${query ? `?${query}` : ""}`);
        if (cancelled) return;

        // middleware.ts redirects unauthenticated requests to
        // /api/registrations to /backoffice/login; fetch() follows that
        // same-origin redirect and yields a 200 HTML response here instead
        // of the route handler's 401 JSON. Detect that (via
        // response.redirected and/or a non-JSON content type) and send the
        // browser to the login page instead of trying to parse HTML as JSON.
        const contentType = response.headers.get("content-type") ?? "";
        if (response.redirected || !contentType.includes("application/json")) {
          router.replace("/backoffice/login");
          return;
        }

        const body = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          setLoadStatus("error");
          setErrorMessage(String(body.error ?? "Não foi possível carregar os cadastros."));
          setRegistrations([]);
          return;
        }

        const nextRegistrations = (body as { registrations: unknown }).registrations;
        if (!Array.isArray(nextRegistrations)) {
          setLoadStatus("error");
          setErrorMessage("Não foi possível carregar os cadastros.");
          setRegistrations([]);
          return;
        }

        setRegistrations(nextRegistrations as RegistrationListItem[]);
        setLoadStatus("idle");
      } catch {
        if (!cancelled) {
          setLoadStatus("error");
          setErrorMessage("Não foi possível carregar os cadastros.");
          setRegistrations([]);
        }
      }
    }

    load().catch((err) => {
      console.error("Unexpected error while loading registrations:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [debouncedNome, debouncedLocalidade, anoEscolar, status, router]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main>
      <h1>Backoffice — cadastros</h1>

      <form onSubmit={onSubmit}>
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
            onChange={(event) => setAnoEscolar(event.target.value)}
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
          <select id={statusId} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" disabled={loadStatus === "loading"}>
          Buscar
        </button>
      </form>

      {loadStatus === "error" && errorMessage && <p role="alert">{errorMessage}</p>}

      <table>
        <thead>
          <tr>
            <th scope="col">Nome</th>
            <th scope="col">Idade</th>
            <th scope="col">Localidade</th>
            <th scope="col">Ano escolar</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {registrations.map((registration) => (
            <tr key={registration.id}>
              <td>
                <Link href={`/backoffice/${registration.id}`}>{registration.nome}</Link>
              </td>
              <td>{registration.idade}</td>
              <td>{registration.localidade}</td>
              <td>{registration.ano_escolar}</td>
              <td>{registration.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {loadStatus === "idle" && registrations.length === 0 && (
        <p>Nenhum cadastro encontrado.</p>
      )}
    </main>
  );
}
