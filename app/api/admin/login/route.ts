/**
 * POST /api/admin/login
 *
 * Single shared-password admin login (spec.md §5.2 use case 2, decisions.md
 * "Autenticação do backoffice"). On a correct password, issues a signed,
 * httpOnly session cookie (see lib/auth/session.ts). On failure, returns a
 * 4xx JSON error naming invalid credentials and sets no cookie.
 */
import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

interface LoginRequestBody {
  password?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  let body: LoginRequestBody;
  try {
    body = (await request.json()) as LoginRequestBody;
  } catch {
    body = {};
  }

  const password = typeof body.password === "string" ? body.password : "";

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error("Missing ADMIN_PASSWORD environment variable");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  if (!password || password !== adminPassword) {
    return NextResponse.json({ error: "Senha inválida" }, { status: 401 });
  }

  const token = await createSessionToken();
  const response = NextResponse.json({ ok: true }, { status: 200 });
  setSessionCookie(response, token);
  return response;
}
