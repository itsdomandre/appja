"use client";

/**
 * Admin login form (spec.md §5.2 use case 2). Posts the shared admin
 * password to /api/admin/login; on success, the browser follows the session
 * cookie the route sets and this navigates on to /backoffice.
 */
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import Topbar from "@/components/Topbar";

type Status = "idle" | "submitting" | "error";

export default function BackofficeLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const passwordId = useId();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    handleSubmit(event).catch((err) => {
      console.error("Unexpected error while logging in:", err);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (response.ok) {
        router.push("/backoffice");
        return;
      }

      const body = await response.json().catch(() => ({}));
      setStatus("error");
      setErrorMessage(String(body.error ?? "Não foi possível iniciar sessão."));
    } catch {
      setStatus("error");
      setErrorMessage("Não foi possível iniciar sessão.");
    }
  }

  return (
    <>
      <Topbar />
      <main className="flex justify-center">
        <form
          onSubmit={onSubmit}
          noValidate
          className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
        >
          <h1>Acesso ao backoffice</h1>

          <div className="form-field">
            <label htmlFor={passwordId}>Senha</label>
            <input
              id={passwordId}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoFocus
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={status === "submitting"}>
            Entrar
          </button>

          {status === "error" && errorMessage && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}
        </form>
      </main>
    </>
  );
}
