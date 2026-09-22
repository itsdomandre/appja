/**
 * GET /api/registrations/[id]
 *
 * Admin-only detail lookup (spec.md §5.2 use case 4, §8 AC17-AC18). Returns
 * every stored column plus a computed `idade` and a short-lived Supabase
 * Storage signed URL (`foto_url`) for the photo; 404s with a message naming
 * the missing id when no such registration exists.
 *
 * Same admin-session-in-handler rationale as `app/api/registrations/route.ts`
 * (GET): these route-handler unit tests invoke GET directly and bypass
 * middleware.ts entirely, so the check can't be left to middleware alone.
 */
import { calculateAge } from "@/lib/registrations/age";
import { UUID_PATTERN } from "@/lib/registrations/id";
import { requireAdminSession } from "@/lib/auth/session";
import type { RegistrationRow } from "@/lib/registrations/query";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateRegistrationInput, type RegistrationInput } from "@/lib/validation/registration";

/** 5 minutes -- long enough to load the detail page and view the photo, short
 * enough to keep leaked links useless quickly (spec.md §9 signed-URL risk). */
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const authError = await requireAdminSession(request);
  if (authError) return authError;

  const { id } = await context.params;

  if (!UUID_PATTERN.test(id)) {
    return Response.json({ error: `Registration not found for id ${id}` }, { status: 404 });
  }

  const supabase = createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("registrations")
    .select("*")
    .eq("id", id)
    .maybeSingle<RegistrationRow>();

  if (error) {
    console.error("Failed to fetch registration:", error);
    return Response.json({ error: "Failed to fetch registration" }, { status: 500 });
  }

  if (!row) {
    return Response.json({ error: `Registration not found for id ${id}` }, { status: 404 });
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from("fotos")
    .createSignedUrl(row.foto_path, SIGNED_URL_EXPIRY_SECONDS);

  if (signedUrlError || !signedUrlData) {
    console.error("Failed to create signed URL for foto:", signedUrlError);
    return Response.json({ error: "Failed to fetch registration photo" }, { status: 500 });
  }

  return Response.json(
    {
      ...row,
      idade: calculateAge(row.data_nascimento),
      foto_url: signedUrlData.signedUrl,
    },
    { status: 200 },
  );
}

/**
 * PATCH /api/registrations/[id]
 *
 * Admin-only edit of a registration's non-photo, non-status fields
 * (stakeholder request, post sub-task 7 -- see decisions.md "Edição pelo
 * admin"). Reuses `validateRegistrationInput`'s field rules (required
 * fields, telefone format, ano_escolar list) by forcing `consentimento:
 * true`, since an edit never touches that column -- it was already recorded
 * at submission time and consent withdrawal isn't in scope here.
 */
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

  const input = (body && typeof body === "object" ? body : {}) as Partial<RegistrationInput>;

  const validation = validateRegistrationInput({ ...input, consentimento: true });
  if (!validation.valid) {
    const message = Object.values(validation.errors).join("; ");
    return Response.json({ error: message }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("registrations")
    .update({
      nome: input.nome,
      telefone: input.telefone,
      data_nascimento: input.data_nascimento,
      ano_escolar: input.ano_escolar,
      localidade: input.localidade,
      email: input.email ?? null,
      instagram: input.instagram ?? null,
      tiktok: input.tiktok ?? null,
      observacoes: input.observacoes ?? null,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    console.error("Failed to update registration:", error);
    return Response.json({ error: "Failed to update registration" }, { status: 500 });
  }

  if (!row) {
    return Response.json({ error: `Registration not found for id ${id}` }, { status: 404 });
  }

  return Response.json({ id: row.id }, { status: 200 });
}
