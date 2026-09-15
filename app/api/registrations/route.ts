/**
 * POST /api/registrations
 *
 * STUB — always responds 501 Not Implemented, regardless of the request
 * body. Zero business logic. Owned by the implementer sub-task, who will
 * wire in lib/validation/registration.ts, lib/supabase/server.ts and
 * lib/images/compress.ts to satisfy the acceptance criteria.
 */
export async function POST(_request: Request): Promise<Response> {
  return new Response(null, { status: 501 });
}
