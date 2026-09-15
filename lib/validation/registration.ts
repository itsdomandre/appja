/**
 * Validation contract for the public registration form (/cadastro) and its
 * API route (POST /api/registrations).
 *
 * STUB — interface shape only, zero real validation logic. This module is
 * owned by the implementer sub-task; it exists here only so importers
 * (route handlers, components, tests) are import-clean.
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

/**
 * Validates the non-file fields of a registration submission.
 * NOT IMPLEMENTED: always reports failure so this stub can never
 * accidentally satisfy an acceptance criterion.
 */
export function validateRegistrationInput(
  _input: Partial<RegistrationInput>,
): ValidationResult {
  return { valid: false, errors: { _stub: "validateRegistrationInput not implemented" } };
}

/**
 * Validates the uploaded photo (presence + size).
 * NOT IMPLEMENTED: always reports failure so this stub can never
 * accidentally satisfy an acceptance criterion.
 */
export function validateFoto(_file: File | Blob | null | undefined): ValidationResult {
  return { valid: false, errors: { _stub: "validateFoto not implemented" } };
}
