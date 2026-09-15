/**
 * Validation contract for the public registration form (/cadastro) and its
 * API route (POST /api/registrations).
 */

export const ANO_ESCOLAR_OPTIONS = [
  "Pré-escolar",
  "1º ano",
  "2º ano",
  "3º ano",
  "4º ano",
  "5º ano",
  "6º ano",
  "7º ano",
  "8º ano",
  "9º ano",
  "10º ano",
  "11º ano",
  "12º ano",
  "Ensino Superior — Licenciatura",
  "Ensino Superior — Mestrado",
  "Ensino Superior — Doutoramento",
  "Não estudante",
] as const;

export type AnoEscolar = (typeof ANO_ESCOLAR_OPTIONS)[number];

/** telefone must be 9 digits starting with 9, e.g. 912345678 */
export const TELEFONE_REGEX = /^9\d{8}$/;

export const MAX_FOTO_SIZE_BYTES = 20 * 1024 * 1024;

export interface RegistrationInput {
  nome: string;
  telefone: string;
  data_nascimento: string;
  ano_escolar: string;
  localidade: string;
  email?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  observacoes?: string | null;
  consentimento: boolean;
}

export interface RegistrationFieldErrors {
  [field: string]: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: RegistrationFieldErrors;
}

const REQUIRED_TEXT_FIELDS: Array<keyof RegistrationInput> = [
  "nome",
  "telefone",
  "data_nascimento",
  "ano_escolar",
  "localidade",
];

/**
 * Validates the non-file fields of a registration submission.
 */
export function validateRegistrationInput(
  input: Partial<RegistrationInput>,
): ValidationResult {
  const errors: RegistrationFieldErrors = {};

  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = input[field];
    if (typeof value !== "string" || value.trim() === "") {
      errors[field] = `${field} is required`;
    }
  }

  if (
    typeof input.telefone === "string" &&
    input.telefone.trim() !== "" &&
    !TELEFONE_REGEX.test(input.telefone)
  ) {
    errors.telefone = "telefone must match the format 9XXXXXXXX";
  }

  if (
    typeof input.ano_escolar === "string" &&
    input.ano_escolar.trim() !== "" &&
    !(ANO_ESCOLAR_OPTIONS as readonly string[]).includes(input.ano_escolar)
  ) {
    errors.ano_escolar = "ano_escolar must be one of the fixed options";
  }

  if (input.consentimento !== true) {
    errors.consentimento = "consentimento is required (consent must be given)";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Validates the uploaded photo (presence + size).
 */
export function validateFoto(file: File | Blob | null | undefined): ValidationResult {
  const errors: RegistrationFieldErrors = {};

  if (!file || file.size === 0) {
    errors.foto = "foto is required";
  } else if (file.size > MAX_FOTO_SIZE_BYTES) {
    errors.foto = "foto exceeds the maximum allowed size";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
