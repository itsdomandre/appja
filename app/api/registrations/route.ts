/**
 * POST /api/registrations
 *
 * Parses a multipart/form-data registration submission, validates it,
 * compresses the uploaded photo, uploads it to the private `fotos` storage
 * bucket, and inserts a `pendente` row into `public.registrations`.
 *
 * GET /api/registrations (sub-task 3, spec.md §5.2 use case 3, §8 AC12-AC16;
 * pagination added for §8 AC36, sub-task 7)
 *
 * Admin-only listing with optional filters (`nome`/`localidade` -- substring,
 * case-insensitive; `ano_escolar`/`status` -- exact match), each item
 * carrying a computed `idade`. The admin-session check happens directly in
 * this handler (not just via middleware.ts) because these route-handler unit
 * tests invoke GET/POST directly and bypass middleware entirely.
 *
 * `page`/`limit` are optional query params. When both are provided, the
 * response is `{ registrations: [...], total }`, where `total` is the count
 * of all rows matching the current filters (not just the requested page).
 * When absent, the response is unchanged (`{ registrations: [...] }`, no
 * `total` field) -- preserves AC12-AC16 exactly. When provided, both must be
 * positive integers or the response is a 400 naming the invalid value(s) --
 * otherwise e.g. `page=0` silently produced a misleading empty-but-nonzero-
 * total response, and a non-integer `page` produced a slice that didn't
 * align to any real page boundary.
 */
import { calculateAge } from "@/lib/registrations/age";
import { listRegistrations, type RegistrationFilters } from "@/lib/registrations/query";
import { compressImage } from "@/lib/images/compress";
import { requireAdminSession } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  validateFoto,
  validateRegistrationInput,
  type RegistrationInput,
} from "@/lib/validation/registration";

function fieldToString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string") return undefined;
  return value;
}

function optionalField(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Malformed form submission" }, { status: 400 });
  }

  const consentRaw = fieldToString(formData.get("consentimento"));

  const input: Partial<RegistrationInput> = {
    nome: fieldToString(formData.get("nome"))?.trim(),
    telefone: fieldToString(formData.get("telefone"))?.trim(),
    data_nascimento: fieldToString(formData.get("data_nascimento"))?.trim(),
    ano_escolar: fieldToString(formData.get("ano_escolar"))?.trim(),
    localidade: fieldToString(formData.get("localidade"))?.trim(),
    email: optionalField(formData.get("email")),
    instagram: optionalField(formData.get("instagram")),
    tiktok: optionalField(formData.get("tiktok")),
    observacoes: optionalField(formData.get("observacoes")),
    consentimento: consentRaw === "true",
  };

  const fotoEntry = formData.get("foto");
  const foto = fotoEntry instanceof File ? fotoEntry : null;

  const inputResult = validateRegistrationInput(input);
  const fotoResult = validateFoto(foto);

  if (!inputResult.valid || !fotoResult.valid) {
    const errors = { ...inputResult.errors, ...fotoResult.errors };
    const message = Object.values(errors).join("; ");
    return Response.json({ error: message }, { status: 400 });
  }

  if (!foto) {
    return Response.json({ error: "foto is required" }, { status: 400 });
  }

  let compressed: Awaited<ReturnType<typeof compressImage>>;
  try {
    const originalBuffer = Buffer.from(await foto.arrayBuffer());
    compressed = await compressImage(originalBuffer);
  } catch (err) {
    console.error("Failed to process uploaded foto:", err);
    return Response.json({ error: "foto could not be processed" }, { status: 400 });
  }

  const supabase = createSupabaseServerClient();

  const objectPath = `${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("fotos")
    .upload(objectPath, compressed.buffer, {
      contentType: compressed.contentType,
      upsert: false,
    });

  if (uploadError) {
    console.error("Failed to upload foto:", uploadError);
    return Response.json({ error: "Failed to submit registration" }, { status: 500 });
  }

  const { data: row, error: insertError } = await supabase
    .from("registrations")
    .insert({
      nome: input.nome,
      telefone: input.telefone,
      data_nascimento: input.data_nascimento,
      ano_escolar: input.ano_escolar,
      localidade: input.localidade,
      email: input.email ?? null,
      instagram: input.instagram ?? null,
      tiktok: input.tiktok ?? null,
      observacoes: input.observacoes ?? null,
      foto_path: objectPath,
      consentimento: input.consentimento,
      status: "pendente",
    })
    .select("id, status")
    .single();

  if (insertError || !row) {
    console.error("Failed to create registration:", insertError);
    const { error: removeError } = await supabase.storage.from("fotos").remove([objectPath]);
    if (removeError) {
      console.error("Failed to clean up orphaned foto after insert failure:", removeError);
    }
    return Response.json({ error: "Failed to submit registration" }, { status: 500 });
  }

  return Response.json({ id: row.id, status: row.status }, { status: 201 });
}

export async function GET(request: Request): Promise<Response> {
  const authError = await requireAdminSession(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const filters: RegistrationFilters = {};
  const nome = url.searchParams.get("nome");
  const localidade = url.searchParams.get("localidade");
  const anoEscolar = url.searchParams.get("ano_escolar");
  const status = url.searchParams.get("status");
  if (nome) filters.nome = nome;
  if (localidade) filters.localidade = localidade;
  if (anoEscolar) filters.ano_escolar = anoEscolar;
  if (status) filters.status = status;

  const supabase = createSupabaseServerClient();

  const pageParam = url.searchParams.get("page");
  const limitParam = url.searchParams.get("limit");
  const hasPagination = pageParam !== null && limitParam !== null;

  if (hasPagination) {
    const page = Number(pageParam);
    const limit = Number(limitParam);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1) {
      return Response.json(
        { error: `Invalid page/limit: page=${pageParam}, limit=${limitParam}. Both must be positive integers` },
        { status: 400 },
      );
    }

    let result;
    try {
      result = await listRegistrations(supabase, filters, { page, limit });
    } catch (err) {
      console.error("Failed to list registrations:", err);
      return Response.json({ error: "Failed to list registrations" }, { status: 500 });
    }

    const registrations = result.rows.map((row) => ({
      ...row,
      idade: calculateAge(row.data_nascimento),
    }));

    return Response.json({ registrations, total: result.total }, { status: 200 });
  }

  let rows;
  try {
    rows = await listRegistrations(supabase, filters);
  } catch (err) {
    console.error("Failed to list registrations:", err);
    return Response.json({ error: "Failed to list registrations" }, { status: 500 });
  }

  const registrations = rows.map((row) => ({
    ...row,
    idade: calculateAge(row.data_nascimento),
  }));

  return Response.json({ registrations }, { status: 200 });
}
