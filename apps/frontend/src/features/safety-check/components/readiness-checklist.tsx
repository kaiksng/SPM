import { READINESS_STATUS_LABELS, type EventReadiness } from "@spm/shared";
import { Link } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { READINESS_ITEM_BADGE_CLASSES } from "@/features/safety-check/services/event-readiness";
import { cn } from "@/lib/utils";

function ReadinessBadge({ status }: { status: keyof typeof READINESS_STATUS_LABELS }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        READINESS_ITEM_BADGE_CLASSES[status],
      )}
    >
      {READINESS_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * AC01/AC02/AC07: every venue booking and equipment requirement shown as
 * Complete, Pending, Not Required, or Needs Review, plus the overall venue
 * and equipment arrangement status. Mostly derived (AC04) — the one
 * writable action is the assigned coordinator resolving a Needs Review item
 * once they've addressed it (resolve_arrangement_flag, 202610200010),
 * surfaced only when canResolve is true and a resolve handler is given.
 * A venue booking held up by a conflict, disruption or hold cannot be marked
 * resolved; it is fixed on the Venue step, so it links there instead.
 */
export function ReadinessChecklist({
  readiness,
  canResolve = false,
  resolvingId,
  onResolveBooking,
  onResolveRequirement,
  venueStepHref,
}: {
  readiness: EventReadiness;
  canResolve?: boolean;
  /** The booking/requirement id currently being resolved, if any. */
  resolvingId?: string;
  onResolveBooking?: (bookingId: string) => void;
  onResolveRequirement?: (requirementId: string) => void;
  venueStepHref?: string;
}) {
  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          Venue arrangements
        </h2>
        {readiness.venues.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No active venue booking for this event.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {readiness.venues.map((booking) => (
              <li key={booking.bookingId} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="min-w-0 flex-1">
                  <span className="text-sm text-slate-800">
                    {booking.venueName}
                    {booking.isMainVenue && (
                      <span className="ml-2 text-xs font-medium text-slate-400">Main venue</span>
                    )}
                  </span>
                  {booking.needsReviewReason && (
                    <span className="mt-0.5 block text-xs text-orange-700">{booking.needsReviewReason}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <ReadinessBadge status={booking.status} />
                  {canResolve && booking.status === "needs_review" && booking.canMarkResolved && onResolveBooking && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resolvingId === booking.bookingId}
                      onClick={() => onResolveBooking(booking.bookingId)}
                    >
                      {resolvingId === booking.bookingId ? "Resolving…" : "Mark resolved"}
                    </Button>
                  )}
                  {canResolve && booking.status === "needs_review" && !booking.canMarkResolved && venueStepHref && (
                    <Link to={venueStepHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Go to Venue step
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          Equipment arrangements
        </h2>
        {readiness.equipment.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No equipment was requested for this event.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {readiness.equipment.map((requirement) => (
              <li
                key={requirement.requirementId}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-sm text-slate-800">{requirement.equipmentName}</span>
                  {requirement.needsReviewReason && (
                    <span className="mt-0.5 block text-xs text-orange-700">{requirement.needsReviewReason}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <ReadinessBadge status={requirement.status} />
                  {canResolve && requirement.status === "needs_review" && onResolveRequirement && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={resolvingId === requirement.requirementId}
                      onClick={() => onResolveRequirement(requirement.requirementId)}
                    >
                      {resolvingId === requirement.requirementId ? "Resolving…" : "Mark resolved"}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
