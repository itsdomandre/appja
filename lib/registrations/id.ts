/**
 * Shared id-shape check for the `registrations` resource's `[id]` routes
 * (GET detail, PATCH status). Matches the `uuid` type's textual
 * representation (RFC 4122 layout, version digit not enforced since
 * Postgres' `uuid` column accepts any variant). Used to reject
 * syntactically-invalid ids as a clean 404 before they ever reach Postgres,
 * which would otherwise surface as a generic 500 ("invalid input syntax for
 * type uuid").
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
