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
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { initials } from "@/lib/initials";
import { ANO_ESCOLAR_OPTIONS, STATUS_OPTIONS, type Status } from "@/lib/validation/registration";
import Topbar from "@/components/Topbar";

/** How long the "Status atualizado." confirmation stays visible before the
 * indicator reverts to idle. */
const STATUS_SUCCESS_DISPLAY_MS = 3000;

interface EditableFields {
  nome: string;
  telefone: string;
  data_nascimento: string;
  ano_escolar: string;
  localidade: string;
  email: string;
  instagram: string;
  tiktok: string;
  observacoes: string;
}

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
  status: Status;
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
  const statusSelectId = useId();
  const nomeEditId = useId();
  const telefoneEditId = useId();
  const dataNascimentoEditId = useId();
  const anoEscolarEditId = useId();
  const localidadeEditId = useId();
  const emailEditId = useId();
  const instagramEditId = useId();
  const tiktokEditId = useId();
  const observacoesEditId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [statusUpdate, setStatusUpdate] = useState<
    { status: "idle" } | { status: "saving" } | { status: "success" } | { status: "error"; message: string }
  >({ status: "idle" });
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState<EditableFields | null>(null);
  const [saveState, setSaveState] = useState<
    { status: "idle" } | { status: "saving" } | { status: "error"; message: string }
  >({ status: "idle" });

  // Guards handleStatusChange's post-await state updates against firing
  // after the component has unmounted, same rationale as the initial-load
  // effect's `cancelled` flag below.
  const mountedRef = useRef(true);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Held in a ref (not used directly as the data-fetch effect's dependency
  // below) because next/navigation's useRouter() return value isn't
  // guaranteed referentially stable across renders; including it directly in
  // that effect's dependency array would re-run it (and re-fetch) on every
  // render, not just when `id` changes. Same fix as app/backoffice/page.tsx.
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    };
  }, []);

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
          routerRef.current.replace("/backoffice/login");
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
  }, [id]);

  async function handleStatusChange(nextStatus: string) {
    if (!id) return;

    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    setStatusUpdate({ status: "saving" });
    try {
      const response = await fetch(`/api/registrations/${id}/status`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!mountedRef.current) return;

      const contentType = response.headers.get("content-type") ?? "";
      if (response.redirected || !contentType.includes("application/json")) {
        router.replace("/backoffice/login");
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!mountedRef.current) return;

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
      successTimeoutRef.current = setTimeout(() => {
        if (mountedRef.current) setStatusUpdate({ status: "idle" });
      }, STATUS_SUCCESS_DISPLAY_MS);
    } catch {
      if (mountedRef.current) {
        setStatusUpdate({ status: "error", message: "Não foi possível atualizar o status." });
      }
    }
  }

  function startEditing() {
    if (state.status !== "loaded") return;
    const r = state.registration;
    setEditFields({
      nome: r.nome,
      telefone: r.telefone,
      data_nascimento: r.data_nascimento,
      ano_escolar: r.ano_escolar,
      localidade: r.localidade,
      email: r.email ?? "",
      instagram: r.instagram ?? "",
      tiktok: r.tiktok ?? "",
      observacoes: r.observacoes ?? "",
    });
    setSaveState({ status: "idle" });
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setEditFields(null);
    setSaveState({ status: "idle" });
  }

  function updateEditField(name: keyof EditableFields) {
    return (event: { target: { value: string } }) => {
      setEditFields((current) => (current ? { ...current, [name]: event.target.value } : current));
    };
  }

  async function handleSaveEdit() {
    if (!id || !editFields) return;

    setSaveState({ status: "saving" });
    try {
      const response = await fetch(`/api/registrations/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nome: editFields.nome,
          telefone: editFields.telefone,
          data_nascimento: editFields.data_nascimento,
          ano_escolar: editFields.ano_escolar,
          localidade: editFields.localidade,
          email: editFields.email || null,
          instagram: editFields.instagram || null,
          tiktok: editFields.tiktok || null,
          observacoes: editFields.observacoes || null,
        }),
      });
      if (!mountedRef.current) return;

      const contentType = response.headers.get("content-type") ?? "";
      if (response.redirected || !contentType.includes("application/json")) {
        router.replace("/backoffice/login");
        return;
      }

      const body = await response.json().catch(() => ({}));
      if (!mountedRef.current) return;

      if (!response.ok) {
        setSaveState({
          status: "error",
          message: String(body.error ?? "Não foi possível guardar as alterações."),
        });
        return;
      }

      const savedFields = editFields;
      setState((current) =>
        current.status === "loaded"
          ? {
              status: "loaded",
              registration: {
                ...current.registration,
                nome: savedFields.nome,
                telefone: savedFields.telefone,
                data_nascimento: savedFields.data_nascimento,
                ano_escolar: savedFields.ano_escolar,
                localidade: savedFields.localidade,
                email: savedFields.email || null,
                instagram: savedFields.instagram || null,
                tiktok: savedFields.tiktok || null,
                observacoes: savedFields.observacoes || null,
              },
            }
          : current,
      );
      setEditing(false);
      setEditFields(null);
      setSaveState({ status: "idle" });
    } catch {
      if (mountedRef.current) {
        setSaveState({ status: "error", message: "Não foi possível guardar as alterações." });
      }
    }
  }

  if (state.status === "loading") {
    return (
      <>
        <Topbar showLogout />
        <main>
          <p>A carregar…</p>
        </main>
      </>
    );
  }

  if (state.status === "error") {
    return (
      <>
        <Topbar showLogout />
        <main>
          <p role="alert">{state.message}</p>
        </main>
      </>
    );
  }

  const registration = state.registration;

  return (
    <>
      <Topbar showLogout />
      <main>
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/backoffice"
            className="inline-flex items-center gap-1 text-sm font-medium text-gray-600
              hover:text-gray-900 hover:underline"
          >
            ← Voltar para Home
          </Link>

          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium
                text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              Editar
            </button>
          )}
        </div>

        <div className="mb-6 flex items-center gap-4">
          <span
            className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200
              text-lg font-semibold text-gray-700"
          >
            {initials(registration.nome)}
          </span>
          <div>
            <h1 className="mb-1">{registration.nome}</h1>
            <div className="flex items-center gap-3">
              <label htmlFor={statusSelectId} className="sr-only">
                Status
              </label>
              <select
                id={statusSelectId}
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
              {statusUpdate.status === "saving" && <span role="status">A guardar…</span>}
              {statusUpdate.status === "success" && (
                <span role="status">Status atualizado.</span>
              )}
              {statusUpdate.status === "error" && (
                <span role="alert">{statusUpdate.message}</span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:col-span-1">
            <img
              src={registration.foto_url}
              alt={`Foto de ${registration.nome}`}
              width={320}
              className="w-full rounded-xl object-cover"
            />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:col-span-2">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt>Nome completo</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={nomeEditId} className="sr-only">
                      Nome completo
                    </label>
                    <input
                      id={nomeEditId}
                      type="text"
                      value={editFields.nome}
                      onChange={updateEditField("nome")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.nome}</dd>
                )}
              </div>

              <div>
                <dt>Idade</dt>
                <dd>{registration.idade}</dd>
              </div>

              <div>
                <dt>Telefone</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={telefoneEditId} className="sr-only">
                      Telefone
                    </label>
                    <input
                      id={telefoneEditId}
                      type="text"
                      value={editFields.telefone}
                      onChange={updateEditField("telefone")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.telefone}</dd>
                )}
              </div>

              <div>
                <dt>Data de nascimento</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={dataNascimentoEditId} className="sr-only">
                      Data de nascimento
                    </label>
                    <input
                      id={dataNascimentoEditId}
                      type="text"
                      inputMode="numeric"
                      pattern="\d{4}-\d{2}-\d{2}"
                      placeholder="AAAA-MM-DD"
                      value={editFields.data_nascimento}
                      onChange={updateEditField("data_nascimento")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.data_nascimento}</dd>
                )}
              </div>

              <div>
                <dt>Ano escolar</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={anoEscolarEditId} className="sr-only">
                      Ano escolar
                    </label>
                    <select
                      id={anoEscolarEditId}
                      value={editFields.ano_escolar}
                      onChange={updateEditField("ano_escolar")}
                    >
                      {ANO_ESCOLAR_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </dd>
                ) : (
                  <dd>{registration.ano_escolar}</dd>
                )}
              </div>

              <div>
                <dt>Localidade</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={localidadeEditId} className="sr-only">
                      Localidade
                    </label>
                    <input
                      id={localidadeEditId}
                      type="text"
                      value={editFields.localidade}
                      onChange={updateEditField("localidade")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.localidade}</dd>
                )}
              </div>

              <div>
                <dt>Email</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={emailEditId} className="sr-only">
                      Email
                    </label>
                    <input
                      id={emailEditId}
                      type="email"
                      value={editFields.email}
                      onChange={updateEditField("email")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.email ?? "—"}</dd>
                )}
              </div>

              <div>
                <dt>Instagram</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={instagramEditId} className="sr-only">
                      Instagram
                    </label>
                    <input
                      id={instagramEditId}
                      type="text"
                      value={editFields.instagram}
                      onChange={updateEditField("instagram")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.instagram ?? "—"}</dd>
                )}
              </div>

              <div>
                <dt>TikTok</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={tiktokEditId} className="sr-only">
                      TikTok
                    </label>
                    <input
                      id={tiktokEditId}
                      type="text"
                      value={editFields.tiktok}
                      onChange={updateEditField("tiktok")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.tiktok ?? "—"}</dd>
                )}
              </div>

              <div className="sm:col-span-2">
                <dt>Observações</dt>
                {editing && editFields ? (
                  <dd>
                    <label htmlFor={observacoesEditId} className="sr-only">
                      Observações
                    </label>
                    <textarea
                      id={observacoesEditId}
                      value={editFields.observacoes}
                      onChange={updateEditField("observacoes")}
                    />
                  </dd>
                ) : (
                  <dd>{registration.observacoes ?? "—"}</dd>
                )}
              </div>

              {editing && (
                <div className="sm:col-span-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveEdit().catch((err) => {
                        console.error("Unexpected error while saving registration edits:", err);
                      });
                    }}
                    disabled={saveState.status === "saving"}
                    className="btn-primary"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saveState.status === "saving"}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm
                      font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  {saveState.status === "saving" && <span role="status">A guardar…</span>}
                  {saveState.status === "error" && (
                    <span role="alert">{saveState.message}</span>
                  )}
                </div>
              )}
            </dl>
          </div>
        </div>
      </main>
    </>
  );
}
