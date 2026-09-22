/**
 * Query building for the admin listing/search of `registrations`
 * (spec.md §5.2 use case 3, §8 AC13-AC16; pagination added for §8 AC36,
 * sub-task 7).
 *
 * `ano_escolar` and `status` are exact matches; `nome` and `localidade` are
 * case-insensitive substring matches (Postgres `ilike` via
 * `%value%`, through the Supabase query builder).
 *
 * Pagination is additive and opt-in via a third `pagination` argument: with
 * it omitted, `listRegistrations` keeps its original signature and return
 * type (a plain `RegistrationRow[]`, per lib/registrations/query.test.ts's
 * existing AC13-AC16 coverage -- unaffected by this change). Passing
 * `{ page, limit }` switches to `{ rows, total }`, where `total` is the
 * count of all rows matching the current filters (not just the requested
 * page) -- computed in the same query via Supabase's `count: "exact"`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RegistrationFilters {
  nome?: string;
  localidade?: string;
  ano_escolar?: string;
  status?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedRegistrations {
  rows: RegistrationRow[];
  total: number;
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
  // Backslash must be escaped first -- otherwise the backslashes inserted
  // below to escape `%`/`_` would themselves get re-escaped.
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, (match) => `\\${match}`);
}

export async function listRegistrations(
  supabase: SupabaseClient,
  filters?: RegistrationFilters,
): Promise<RegistrationRow[]>;
export async function listRegistrations(
  supabase: SupabaseClient,
  filters: RegistrationFilters,
  pagination: PaginationOptions,
): Promise<PaginatedRegistrations>;
export async function listRegistrations(
  supabase: SupabaseClient,
  filters: RegistrationFilters = {},
  pagination?: PaginationOptions,
): Promise<RegistrationRow[] | PaginatedRegistrations> {
  let query = supabase
    .from("registrations")
    .select("*", pagination ? { count: "exact" } : undefined);

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

  if (pagination) {
    const from = (pagination.page - 1) * pagination.limit;
    const to = from + pagination.limit - 1;
    query = query.range(from, to);
  }

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list registrations: ${error.message}`);
  }

  const rows = (data ?? []) as RegistrationRow[];

  if (pagination) {
    return { rows, total: count ?? 0 };
  }

  return rows;
}
