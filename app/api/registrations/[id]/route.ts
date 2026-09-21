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
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** 5 minutes -- long enough to load the detail page and view the photo, short
 * enough to keep leaked links useless quickly (spec.md §9 signed-URL risk). */
const SIGNED_URL_EXPIRY_SECONDS = 5 * 60;

function getSessionToken(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const name = part.slice(0, eqIndex).trim();
    if (name === SESSION_COOKIE_NAME) {
      return decodeURIComponent(part.slice(eqIndex + 1).trim());
    }
  }

  return undefined;
}

async function requireAdminSession(request: Request): Promise<Response | null> {
  const token = getSessionToken(request);
  const hasValidSession = await verifySessionToken(token);
  if (!hasValidSession) {
    return Response.json({ error: "Missing or invalid admin session" }, { status: 401 });
  }
  return null;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const authError = await requireAdminSession(request);
  if (authError) return authError;

  const { id } = await context.params;

  const supabase = createSupabaseServerClient();

  const { data: row, error } = await supabase
    .from("registrations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

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
