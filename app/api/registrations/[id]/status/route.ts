/**
 * PATCH /api/registrations/[id]/status
 *
 * Admin-only status transition (spec.md §5.2 use case 5, §8 AC19-AC20).
 * Validates the request body's `status` against the same closed set the
 * database's `registrations_status_check` constraint enforces
 * (supabase/migrations/0001_create_registrations.sql), then persists it.
 *
 * The DB CHECK constraint remains the last line of defense (spec.md §9
 * "senha única compartilhada" risk note) -- this route's own validation
 * exists so a bad request is rejected with a clean 400 naming the invalid
 * value, rather than a raw Postgres constraint violation bubbling up as a
 * 500.
 *
 * Same admin-session-in-handler rationale as
 * app/api/registrations/[id]/route.ts (GET): this route's unit tests invoke
 * PATCH directly and bypass middleware.ts entirely, so the check can't be
 * left to middleware alone.
 */
import { requireAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Mirrors the `registrations_status_check` constraint's allowed values. */
const VALID_STATUSES = ["pendente", "aprovado", "rejeitado"] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];

/** Matches the `uuid` type's textual representation (RFC 4122 layout,
 * version digit not enforced since Postgres' `uuid` column accepts any
 * variant). Used to reject syntactically-invalid ids as a clean 404 before
 * they ever reach Postgres, which would otherwise surface as a generic 500
 * ("invalid input syntax for type uuid"). Same convention as
 * app/api/registrations/[id]/route.ts. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isValidStatus(value: unknown): value is ValidStatus {
  return typeof value === "string" && (VALID_STATUSES as readonly string[]).includes(value);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const authError = await requireAdminSession(request);
  if (authError) return authError;

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body: expected JSON" }, { status: 400 });
  }

  const status = body && typeof body === "object" ? (body as Record<string, unknown>).status : undefined;

  if (!isValidStatus(status)) {
    return Response.json(
      {
        error: `Invalid status: ${JSON.stringify(status)}. Must be one of ${VALID_STATUSES.join(", ")}`,
      },
      { status: 400 },
    );
  }

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: `Registration not found for id ${id}` }, { status: 404 });
  }

  const supabase = createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("registrations")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle<{ id: string; status: string }>();

  if (error) {
    console.error("Failed to update registration status:", error);
    return Response.json({ error: "Failed to update registration status" }, { status: 500 });
  }

  if (!row) {
    return Response.json({ error: `Registration not found for id ${id}` }, { status: 404 });
  }

  return Response.json({ id: row.id, status: row.status }, { status: 200 });
}
