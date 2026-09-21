"use client";

/**
 * Backoffice detail page (spec.md §5.2 use case 4). Fetches
 * `GET /api/registrations/[id]` and renders every field plus the photo via
 * the short-lived signed URL (`foto_url`). Not directly asserted by any
 * test -- a minimal functional page built against the response shape
 * app/api/registrations/[id]/route.test.ts asserts (all stored fields plus
 * `foto_url`, or `{ error }` naming the id on 404).
 */
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
        <dd>{registration.status}</dd>

        <dt>Criado em</dt>
        <dd>{registration.created_at}</dd>
      </dl>
    </main>
  );
}
