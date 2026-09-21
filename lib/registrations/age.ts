/**
 * Calendar-age calculation from `data_nascimento` (spec.md §5.1: "idade é
 * calculada, nunca armazenada"). Used wherever a registration's age needs to
 * be shown (list + detail), never stored on the row itself.
 *
 * `now` is an injectable reference date (defaulting to the real current
 * time) so callers -- and tests -- can get fully deterministic results
 * without freezing global time (see lib/registrations/age.test.ts).
 */
export function calculateAge(dataNascimento: string, now: Date = new Date()): number {
  const birth = new Date(dataNascimento);

  let age = now.getUTCFullYear() - birth.getUTCFullYear();

  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = now.getUTCDate() - birth.getUTCDate();

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}
