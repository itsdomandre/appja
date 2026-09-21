/**
 * POST /api/admin/logout
 *
 * Clears the admin session cookie (spec.md §5.2 use case 6). Idempotent --
 * succeeds even when there was no session to begin with.
 */
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST(_request: Request): Promise<Response> {
  const response = NextResponse.json({ ok: true }, { status: 200 });
  clearSessionCookie(response);
  return response;
}
