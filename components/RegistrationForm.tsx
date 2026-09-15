"use client";

/**
 * Public registration form (used on /cadastro).
 */
import { useId, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ANO_ESCOLAR_OPTIONS } from "@/lib/validation/registration";

export interface RegistrationFormProps {
  onSuccess?: () => void;
}

const CONSENT_TEXT =
  "Ao submeter este formulário, autorizo o envio e o tratamento dos meus dados pessoais e da minha fotografia para efeitos deste cadastro.";

const initialFields = {
  nome: "",
  telefone: "",
  data_nascimento: "",
  ano_escolar: "",
  localidade: "",
  email: "",
  instagram: "",
  tiktok: "",
  observacoes: "",
};

type Status = "idle" | "submitting" | "success" | "error";

export default function RegistrationForm({ onSuccess }: RegistrationFormProps) {
  const [fields, setFields] = useState(initialFields);
  const [consentimento, setConsentimento] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const nomeId = useId();
  const telefoneId = useId();
  const dataNascimentoId = useId();
  const anoEscolarId = useId();
  const localidadeId = useId();
  const fotoId = useId();
  const emailId = useId();
  const instagramId = useId();
  const tiktokId = useId();
  const observacoesId = useId();
  const consentId = useId();
  const consentTextId = useId();

  function updateField(name: keyof typeof initialFields) {
    return (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setFields((prev) => ({ ...prev, [name]: event.target.value }));
    };
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // handleSubmit is async but React's onSubmit doesn't await it; call it
    // explicitly fire-and-forget (with a safety-net .catch) rather than
    // leaving the returned promise floating implicitly.
    handleSubmit(event).catch((err) => {
      console.error("Unexpected error while submitting registration:", err);
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("nome", fields.nome);
    formData.set("telefone", fields.telefone);
    formData.set("data_nascimento", fields.data_nascimento);
    formData.set("ano_escolar", fields.ano_escolar);
    formData.set("localidade", fields.localidade);
    if (fields.email) formData.set("email", fields.email);
    if (fields.instagram) formData.set("instagram", fields.instagram);
    if (fields.tiktok) formData.set("tiktok", fields.tiktok);
    if (fields.observacoes) formData.set("observacoes", fields.observacoes);
    formData.set("consentimento", consentimento ? "true" : "false");

    const foto = fotoInputRef.current?.files?.[0];
    if (foto) {
      formData.set("foto", foto);
    }

    try {
      const response = await fetch("/api/registrations", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        setStatus("success");
        setFields(initialFields);
        setConsentimento(false);
        if (fotoInputRef.current) {
          fotoInputRef.current.value = "";
        }
        onSuccess?.();
      } else {
        const body = await response.json().catch(() => ({}));
        setStatus("error");
        setErrorMessage(String(body.error ?? "Ocorreu um erro ao submeter o cadastro."));
      }
    } catch {
      setStatus("error");
      setErrorMessage("Ocorreu um erro ao submeter o cadastro.");
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div>
        <label htmlFor={nomeId}>Nome</label>
        <input
          id={nomeId}
          type="text"
          value={fields.nome}
          onChange={updateField("nome")}
        />
      </div>

      <div>
        <label htmlFor={telefoneId}>Telefone</label>
        <input
          id={telefoneId}
          type="text"
          value={fields.telefone}
          onChange={updateField("telefone")}
        />
      </div>

      <div>
        <label htmlFor={dataNascimentoId}>Data de nascimento</label>
        <input
          id={dataNascimentoId}
          type="text"
          inputMode="numeric"
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder="AAAA-MM-DD"
          value={fields.data_nascimento}
          onChange={updateField("data_nascimento")}
        />
      </div>

      <div>
        <label htmlFor={anoEscolarId}>Ano escolar</label>
        <select id={anoEscolarId} value={fields.ano_escolar} onChange={updateField("ano_escolar")}>
          <option value="">Selecione...</option>
          {ANO_ESCOLAR_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={localidadeId}>Localidade</label>
        <input
          id={localidadeId}
          type="text"
          value={fields.localidade}
          onChange={updateField("localidade")}
        />
      </div>

      <div>
        <label htmlFor={fotoId}>Foto</label>
        <input id={fotoId} type="file" accept="image/*" ref={fotoInputRef} />
      </div>

      <div>
        <label htmlFor={emailId}>Email</label>
        <input id={emailId} type="email" value={fields.email} onChange={updateField("email")} />
      </div>

      <div>
        <label htmlFor={instagramId}>Instagram</label>
        <input
          id={instagramId}
          type="text"
          value={fields.instagram}
          onChange={updateField("instagram")}
        />
      </div>

      <div>
        <label htmlFor={tiktokId}>TikTok</label>
        <input id={tiktokId} type="text" value={fields.tiktok} onChange={updateField("tiktok")} />
      </div>

      <div>
        <label htmlFor={observacoesId}>Observações</label>
        <textarea
          id={observacoesId}
          value={fields.observacoes}
          onChange={updateField("observacoes")}
        />
      </div>

      <div>
        <input
          id={consentId}
          type="checkbox"
          checked={consentimento}
          onChange={(event) => setConsentimento(event.target.checked)}
          aria-describedby={consentTextId}
        />
        <label htmlFor={consentId}>Consentimento</label>
        <p id={consentTextId}>{CONSENT_TEXT}</p>
      </div>

      <button type="submit" disabled={status === "submitting"}>
        Submeter
      </button>

      {status === "success" && <p role="status">Cadastro enviado com sucesso!</p>}
      {status === "error" && errorMessage && <p role="alert">{errorMessage}</p>}
    </form>
  );
}
