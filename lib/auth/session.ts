import type { NextResponse } from "next/server";

/**
 * Admin session cookie issuance/verification (spec.md §5.2 use case 2, §5.3
 * "Duração da sessão admin").
 *
 * The backoffice has no individual admin accounts (decisions.md
 * "Autenticação do backoffice") -- a single shared `ADMIN_PASSWORD` gates
 * everything. A session is just an HMAC-signed, expiring token: no user
 * identity, just proof that whoever holds the cookie once knew the password.
 *
 * Uses the Web Crypto API (`crypto.subtle`) rather than Node's `crypto`
 * module so this also works under the Edge runtime that Next.js middleware
 * runs on by default.
 */

export const SESSION_COOKIE_NAME = "admin_session";

/** ~8h, per spec.md §5.3 (a reasonable default, not a hard AC). */
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

function textEncode(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function textDecode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Signing secret. There is no dedicated cookie-signing secret env var in
 * this repo (see .env.test/.env.local conventions); we reuse `ADMIN_PASSWORD`
 * as instructed by the sub-task, since it is already the single admin
 * credential and is never exposed to clients.
 */
function getSigningSecret(): string {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("Missing ADMIN_PASSWORD environment variable (used as the session secret)");
  }
  return secret;
}

async function getHmacKey(usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncode(getSigningSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );
}

async function sign(payload: string): Promise<string> {
  const key = await getHmacKey(["sign"]);
  const signatureBuffer = await crypto.subtle.sign("HMAC", key, textEncode(payload));
  return base64UrlEncode(new Uint8Array(signatureBuffer));
}

async function verify(payload: string, signature: string): Promise<boolean> {
  try {
    const signatureBytes = base64UrlDecode(signature);
    const key = await getHmacKey(["verify"]);
    return await crypto.subtle.verify("HMAC", key, signatureBytes, textEncode(payload));
  } catch {
    return false;
  }
}

/**
 * Timing-safe comparison of two equal-length byte arrays. Web Crypto has no
 * built-in generic `timingSafeEqual`, so this XORs every byte and only
 * inspects the accumulated result at the end, avoiding a short-circuiting
 * `!==` on secret-derived data.
 */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Timing-safe check of a submitted admin password against the configured
 * `ADMIN_PASSWORD`. Both values are SHA-256 digested first, so the
 * comparison operates on fixed-length hashes rather than short-circuiting
 * on the raw secret.
 */
export async function verifyAdminPassword(candidate: string, expected: string): Promise<boolean> {
  const [candidateDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncode(candidate)),
    crypto.subtle.digest("SHA-256", textEncode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(candidateDigest), new Uint8Array(expectedDigest));
}

interface SessionPayload {
  exp: number;
}

/** Issues a new signed session token, valid for `SESSION_MAX_AGE_SECONDS`. */
export async function createSessionToken(): Promise<string> {
  const payload: SessionPayload = { exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 };
  const payloadB64 = base64UrlEncode(textEncode(JSON.stringify(payload)));
  const signature = await sign(payloadB64);
  return `${payloadB64}.${signature}`;
}

/** Verifies a session token's signature and expiry. Never throws. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;

  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts as [string, string];

  const signatureValid = await verify(payloadB64, signature);
  if (!signatureValid) return false;

  try {
    const payload = JSON.parse(textDecode(base64UrlDecode(payloadB64))) as Partial<SessionPayload>;
    return typeof payload.exp === "number" && Date.now() < payload.exp;
  } catch {
    return false;
  }
}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Sets the signed, httpOnly admin session cookie on a response. */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions(SESSION_MAX_AGE_SECONDS));
}

/** Clears the admin session cookie (empty value, Max-Age=0) on a response. */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions(0));
}

/**
 * Extracts the admin session cookie's value straight from a raw `cookie`
 * request header. Used by route handlers that can't rely on
 * `next/server`'s `NextRequest`/`cookies()` helpers because they're
 * exercised with plain `Request` instances in tests (bypassing
 * middleware.ts and any Next.js request context).
 *
 * A malformed percent-encoded value (e.g. a bare `%`) makes
 * `decodeURIComponent` throw a `URIError`; that's treated the same as "no
 * cookie present" rather than bubbling up as an unhandled exception.
 */
function getSessionTokenFromHeader(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const eqIndex = part.indexOf("=");
    if (eqIndex === -1) continue;
    const name = part.slice(0, eqIndex).trim();
    if (name === SESSION_COOKIE_NAME) {
      try {
        return decodeURIComponent(part.slice(eqIndex + 1).trim());
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

/**
 * Admin-session guard shared by route handlers that must check auth
 * directly (rather than relying solely on middleware.ts), because their
 * unit tests invoke GET/POST handlers directly with plain `Request`
 * instances. Returns a ready-to-return 401 JSON `Response` when there is no
 * valid admin session, or `null` when the request may proceed.
 */
export async function requireAdminSession(request: Request): Promise<Response | null> {
  const token = getSessionTokenFromHeader(request.headers.get("cookie"));
  const hasValidSession = await verifySessionToken(token);
  if (!hasValidSession) {
    return Response.json({ error: "Missing or invalid admin session" }, { status: 401 });
  }
  return null;
}
