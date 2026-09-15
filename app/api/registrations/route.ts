/**
 * POST /api/registrations
 *
 * Parses a multipart/form-data registration submission, validates it,
 * compresses the uploaded photo, uploads it to the private `fotos` storage
 * bucket, and inserts a `pendente` row into `public.registrations`.
 */
import { compressImage } from "@/lib/images/compress";
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
