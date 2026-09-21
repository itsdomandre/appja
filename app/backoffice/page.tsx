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
import { useEffect, useId, useState } from "react";
import { ANO_ESCOLAR_OPTIONS } from "@/lib/validation/registration";

const STATUS_OPTIONS = ["pendente", "aprovado", "rejeitado"] as const;

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
  const [loadStatus, setLoadStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nomeId = useId();
  const localidadeId = useId();
  const anoEscolarId = useId();
  const statusId = useId();

  // Re-fetches whenever a filter changes; the "Buscar" button below is a
  // convenience for keyboard/form-submit users (preventing a full page
  // navigation) rather than a strictly necessary trigger, since the filter
  // state change alone already re-runs this effect.
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoadStatus("loading");
      setErrorMessage(null);

      const params = new URLSearchParams();
      if (nome.trim()) params.set("nome", nome.trim());
      if (localidade.trim()) params.set("localidade", localidade.trim());
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
          return;
        }

        const nextRegistrations = (body as { registrations: unknown }).registrations;
        if (!Array.isArray(nextRegistrations)) {
          setLoadStatus("error");
          setErrorMessage("Não foi possível carregar os cadastros.");
          return;
        }

        setRegistrations(nextRegistrations as RegistrationListItem[]);
        setLoadStatus("idle");
      } catch {
        if (!cancelled) {
          setLoadStatus("error");
          setErrorMessage("Não foi possível carregar os cadastros.");
        }
      }
    }

    load().catch((err) => {
      console.error("Unexpected error while loading registrations:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [nome, localidade, anoEscolar, status, router]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <main>
      <h1>Backoffice — cadastros</h1>

      <form onSubmit={onSubmit}>
        <div>
          <label htmlFor={nomeId}>Nome</label>
          <input
            id={nomeId}
            type="text"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Buscar por nome"
          />
        </div>

        <div>
          <label htmlFor={localidadeId}>Localidade</label>
          <input
            id={localidadeId}
            type="text"
            value={localidade}
            onChange={(event) => setLocalidade(event.target.value)}
            placeholder="Buscar por localidade"
          />
        </div>

        <div>
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

        <div>
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
            <th>Nome</th>
            <th>Idade</th>
            <th>Localidade</th>
            <th>Ano escolar</th>
            <th>Status</th>
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
