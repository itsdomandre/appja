import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client factory (service-role), used by API routes to
 * write to `registrations` and upload to the private `fotos` bucket.
 *
 * STUB — interface shape only, zero real logic. Owned by the implementer
 * sub-task.
 */
export function createSupabaseServerClient(): SupabaseClient {
  throw new Error("createSupabaseServerClient is not implemented yet");
}
