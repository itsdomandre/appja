"use client";

/**
 * Backoffice detail page (spec.md §5.2 use cases 4-5). Fetches
 * `GET /api/registrations/[id]` and renders every field plus the photo via
 * the short-lived signed URL (`foto_url`), and lets the admin change the
 * status via `PATCH /api/registrations/[id]/status`
 * (app/api/registrations/[id]/status/route.ts, sub-task 4). Not directly
 * asserted by any test -- a minimal functional page built against the
 * response shapes those routes' own route tests assert (all stored fields
 * plus `foto_url`, or `{ error }` naming the id on 404; `{ id, status }` on a
 * successful PATCH, or `{ error }` naming the invalid status on 400).
 */
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STATUS_OPTIONS = ["pendente", "aprovado", "rejeitado"] as const;

interface RegistrationDetail {
  id: string;
  nome: string;
  telefone: string;
  data_nascimento: string;
  ano_escolar: string;
  localidade: string;
  email: string | null;
  instagram: string | null;
  tiktok: string | null;
  observacoes: string | null;
  consentimento: boolean;
  status: string;
  created_at: string;
  idade: number;
  foto_url: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "loaded"; registration: RegistrationDetail };

export default function BackofficeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [statusUpdate, setStatusUpdate] = useState<
    { status: "idle" } | { status: "saving" } | { status: "success" } | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!id) return;

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });
      try {
        const response = await fetch(`/api/registrations/${id}`);
        if (cancelled) return;

        // middleware.ts redirects unauthenticated requests to
        // /api/registrations/:path* to /backoffice/login; fetch() follows
        // that same-origin redirect and yields a 200 HTML response here
        // instead of the route handler's 401 JSON. Detect that (via
        // response.redirected and/or a non-JSON content type) and send the
        // browser to the login page instead of rendering a blank/broken
        // detail view from an unparseable body.
        const contentType = response.headers.get("content-type") ?? "";
        if (response.redirected || !contentType.includes("application/json")) {
          router.replace("/backoffice/login");
          return;
        }

        const body = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          setState({
            status: "error",
            message: String(body.error ?? "Não foi possível carregar o cadastro."),
          });
          return;
        }

        setState({ status: "loaded", registration: body as RegistrationDetail });
      } catch {
        if (!cancelled) {
          setState({ status: "error", message: "Não foi possível carregar o cadastro." });
        }
      }
    }

    load().catch((err) => {
      console.error("Unexpected error while loading registration detail:", err);
    });

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  async function handleStatusChange(nextStatus: string) {
    if (!id) return;

    setStatusUpdate({ status: "saving" });
    try {
      const response = await fetch(`/api/registrations/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (response.redirected || !contentType.includes("application/json")) {
        router.replace("/backoffice/login");
        return;
      }

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatusUpdate({
          status: "error",
          message: String(body.error ?? "Não foi possível atualizar o status."),
        });
        return;
      }

      setState((current) =>
        current.status === "loaded"
          ? { status: "loaded", registration: { ...current.registration, status: body.status } }
          : current,
      );
      setStatusUpdate({ status: "success" });
    } catch {
      setStatusUpdate({ status: "error", message: "Não foi possível atualizar o status." });
    }
  }

  if (state.status === "loading") {
    return (
      <main>
        <p>A carregar…</p>
      </main>
    );
  }

  if (state.status === "error") {
    return (
      <main>
        <p role="alert">{state.message}</p>
      </main>
    );
  }

  const registration = state.registration;

  return (
    <main>
      <h1>{registration.nome}</h1>

      <img src={registration.foto_url} alt={`Foto de ${registration.nome}`} width={320} />

      <dl>
        <dt>Idade</dt>
        <dd>{registration.idade}</dd>

        <dt>Telefone</dt>
        <dd>{registration.telefone}</dd>

        <dt>Data de nascimento</dt>
        <dd>{registration.data_nascimento}</dd>

        <dt>Ano escolar</dt>
        <dd>{registration.ano_escolar}</dd>

        <dt>Localidade</dt>
        <dd>{registration.localidade}</dd>

        <dt>Email</dt>
        <dd>{registration.email ?? "—"}</dd>

        <dt>Instagram</dt>
        <dd>{registration.instagram ?? "—"}</dd>

        <dt>TikTok</dt>
        <dd>{registration.tiktok ?? "—"}</dd>

        <dt>Observações</dt>
        <dd>{registration.observacoes ?? "—"}</dd>

        <dt>Status</dt>
        <dd>
          <label htmlFor="status-select">Status</label>
          <select
            id="status-select"
            value={registration.status}
            disabled={statusUpdate.status === "saving"}
            onChange={(event) => {
              handleStatusChange(event.target.value).catch((err) => {
                console.error("Unexpected error while updating status:", err);
              });
            }}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          {statusUpdate.status === "saving" && <span>A guardar…</span>}
          {statusUpdate.status === "success" && <span role="status">Status atualizado.</span>}
          {statusUpdate.status === "error" && <span role="alert">{statusUpdate.message}</span>}
        </dd>

        <dt>Criado em</dt>
        <dd>{registration.created_at}</dd>
      </dl>
    </main>
  );
}
