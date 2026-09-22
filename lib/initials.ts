/**
 * Shared avatar-initials helper for the backoffice listing and detail pages
 * (spec.md §8 AC37, sub-task 7). Mirrors doctorapp-fe's `initials()` helper:
 * first letter of the first word + first letter of the last word,
 * uppercased. A single-name input yields just that one initial.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase();
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase();
}
