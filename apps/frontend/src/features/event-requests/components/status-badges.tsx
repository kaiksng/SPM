import type { RegistrationAction } from "@spm/shared";
import { CircleAlert } from "lucide-react";

/**
 * Colour-codes the lifecycle status badge so Pending/Submitted, Confirmed
 * and Rejected read as visibly distinct states at a glance, not just by
 * label. Shared across the events list and the event detail page so the same
 * event's status renders identically everywhere.
 */
const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "border-slate-200 bg-slate-50 text-slate-600",
  requested: "border-blue-200 bg-blue-50 text-blue-700",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  clarification_requested: "border-amber-200 bg-amber-50 text-amber-800",
  under_review: "border-amber-200 bg-amber-50 text-amber-800",
  planning: "border-teal-200 bg-teal-50 text-teal-700",
  pending_safety_check: "border-violet-200 bg-violet-50 text-violet-700",
  approved: "border-teal-200 bg-teal-50 text-teal-700",
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  completed: "border-indigo-200 bg-indigo-50 text-indigo-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-500",
  // Venue Catalogue AC06: a venue capacity reduction flagged a booking for
  // review — same amber tone as under_review/clarification_requested.
  needs_review: "border-amber-200 bg-amber-50 text-amber-800",
};

/**
 * "Requested" reads as "Pending" — sitting with the coordinator, nothing
 * outstanding. This is the label whenever there's no open clarification,
 * whether none was ever raised or the organiser has already addressed one.
 */
const STATUS_LABELS: Record<string, string> = {
  requested: "Pending",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${
        STATUS_BADGE_CLASSES[status] ?? "border-blue-200 bg-blue-50 text-blue-700"
      }`}
    >
      {STATUS_LABELS[status] ?? status.replaceAll("_", " ")}
    </span>
  );
}

/** Same label as StatusBadge renders, for contexts (like a <select>) that can't rely on its CSS capitalize. */
export function eventStatusLabel(status: string): string {
  const base = STATUS_LABELS[status] ?? status.replaceAll("_", " ");
  return base
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** A clarification is open: shown to the coordinator, who is waiting on the organiser. */
export function AwaitingOrganiserBadge() {
  return (
    <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
      Awaiting Organiser
    </span>
  );
}

/**
 * The one way to tell the viewer an event needs *their* action. Use it for
 * anything the person looking at the card must do, so "action needed" looks
 * the same everywhere.
 */
export function ActionNeededBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
      <CircleAlert className="size-3.5" aria-hidden="true" />
      {children}
    </span>
  );
}

/** A clarification is open: shown to the organiser, who needs to act. */
export function ClarificationRequiredBadge() {
  return <ActionNeededBadge>Clarification Required</ActionNeededBadge>;
}

/** Registration the organiser still has to fix before the safety check. */
export function RegistrationActionBadge({ action }: { action: RegistrationAction }) {
  return (
    <ActionNeededBadge>
      {action === "setup" ? "Registration setup needed" : "Registration capacity too high"}
    </ActionNeededBadge>
  );
}

/**
 * AC02: the lifecycle status stays "Requested" in the database throughout a
 * clarification, but the UI shows only one pill at a time — the review-state
 * pill takes over the badge slot while a clarification is open, rather than
 * sitting next to the status pill. Once it's addressed (answered/resolved),
 * or if none was ever raised, the badge falls back to the plain status
 * ("Pending") — only a genuinely open, unanswered clarification gets its own
 * (red) treatment, and that treatment reads differently per role.
 */
export function EventStatusBadge({
  status,
  reviewState,
  role,
}: {
  status: string;
  reviewState?: "open";
  role: "organiser" | "coordinator";
}) {
  if (reviewState === "open") {
    return role === "coordinator" ? <AwaitingOrganiserBadge /> : <ClarificationRequiredBadge />;
  }
  return <StatusBadge status={status} />;
}
