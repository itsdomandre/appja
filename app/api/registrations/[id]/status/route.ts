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
import { UUID_PATTERN } from "@/lib/registrations/id";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { STATUS_OPTIONS, type Status } from "@/lib/validation/registration";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function isValidStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUS_OPTIONS as readonly string[]).includes(value);
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const authError = await requireAdminSession(request);
  if (authError) return authError;

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: `Registration not found for id ${id}` }, { status: 404 });
  }

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
        error: `Invalid status: ${JSON.stringify(status)}. Must be one of ${STATUS_OPTIONS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("registrations")
    .update({ status })
    .eq("id", id)
    .select("id, status")
    .maybeSingle<{ id: string; status: Status }>();

  if (error) {
    console.error("Failed to update registration status:", error);
    return Response.json({ error: "Failed to update registration status" }, { status: 500 });
  }

  if (!row) {
    return Response.json({ error: `Registration not found for id ${id}` }, { status: 404 });
  }

  return Response.json({ id: row.id, status: row.status }, { status: 200 });
}
