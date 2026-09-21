/**
 * Query building for the admin listing/search of `registrations`
 * (spec.md §5.2 use case 3, §8 AC13-AC16).
 *
 * `ano_escolar` and `status` are exact matches; `nome` and `localidade` are
 * case-insensitive substring matches (Postgres `ilike` via
 * `%value%`, through the Supabase query builder).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RegistrationFilters {
  nome?: string;
  localidade?: string;
  ano_escolar?: string;
  status?: string;
}

export interface RegistrationRow {
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
  foto_path: string;
  consentimento: boolean;
  status: string;
  created_at: string;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[%_]/g, (match) => `\\${match}`);
}

export async function listRegistrations(
  supabase: SupabaseClient,
  filters: RegistrationFilters = {},
): Promise<RegistrationRow[]> {
  let query = supabase.from("registrations").select("*");

  if (filters.nome) {
    query = query.ilike("nome", `%${escapeIlikePattern(filters.nome)}%`);
  }
  if (filters.localidade) {
    query = query.ilike("localidade", `%${escapeIlikePattern(filters.localidade)}%`);
  }
  if (filters.ano_escolar) {
    query = query.eq("ano_escolar", filters.ano_escolar);
  }
  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list registrations: ${error.message}`);
  }

  return (data ?? []) as RegistrationRow[];
}
