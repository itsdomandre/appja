/**
 * Colored status pill for a registration's `status` (spec.md §8 AC33/AC37 —
 * sub-task 7). Renders the status value itself as visible text (so it can be
 * located per-row without any test-id), with a distinct computed
 * `background-color` per status: pendente=yellow, aprovado=green,
 * rejeitado=red (decision confirmed with the stakeholder — see
 * specs/registration-backoffice/decisions.md). Visual language (pill +
 * small dot) matches the doctorapp-fe reference (not copied verbatim, this
 * is a fresh Tailwind implementation for Next.js).
 */
import type { Status } from "@/lib/validation/registration";

const STATUS_PILL_CLASSES: Record<Status, string> = {
  pendente: "bg-yellow-100 text-yellow-800",
  aprovado: "bg-green-100 text-green-800",
  rejeitado: "bg-red-100 text-red-800",
};

const STATUS_DOT_CLASSES: Record<Status, string> = {
  pendente: "bg-yellow-500",
  aprovado: "bg-green-500",
  rejeitado: "bg-red-500",
};

// Falls back to a neutral style for any runtime value outside the `Status`
// union -- the type now guarantees this at compile time, but `status` still
// ultimately comes from parsed JSON (API responses), which isn't guaranteed
// to match at runtime.
const DEFAULT_PILL_CLASSES = "bg-gray-100 text-gray-700";
const DEFAULT_DOT_CLASSES = "bg-gray-400";

export interface StatusBadgeProps {
  status: Status;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const pillClasses = STATUS_PILL_CLASSES[status] ?? DEFAULT_PILL_CLASSES;
  const dotClasses = STATUS_DOT_CLASSES[status] ?? DEFAULT_DOT_CLASSES;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${pillClasses}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClasses}`} />
      {status}
    </span>
  );
}
