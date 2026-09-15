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
  return trimmed === "" ? null : value;
}

export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();

  const consentRaw = fieldToString(formData.get("consentimento"));

  const input: Partial<RegistrationInput> = {
    nome: fieldToString(formData.get("nome")),
    telefone: fieldToString(formData.get("telefone")),
    data_nascimento: fieldToString(formData.get("data_nascimento")),
    ano_escolar: fieldToString(formData.get("ano_escolar")),
    localidade: fieldToString(formData.get("localidade")),
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

  const originalBuffer = Buffer.from(await foto!.arrayBuffer());
  const compressed = await compressImage(originalBuffer);

  const supabase = createSupabaseServerClient();

  const objectPath = `${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("fotos")
    .upload(objectPath, compressed.buffer, {
      contentType: compressed.contentType,
      upsert: false,
    });

  if (uploadError) {
    return Response.json({ error: `Failed to upload foto: ${uploadError.message}` }, {
      status: 500,
    });
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
    return Response.json(
      { error: `Failed to create registration: ${insertError?.message ?? "unknown error"}` },
      { status: 500 },
    );
  }

  return Response.json({ id: row.id, status: row.status }, { status: 201 });
}
