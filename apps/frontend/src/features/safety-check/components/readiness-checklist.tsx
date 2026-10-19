import { READINESS_STATUS_LABELS, type EventReadiness } from "@spm/shared";

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
 * and equipment arrangement status. Entirely derived (AC04) — nothing here
 * is editable.
 */
export function ReadinessChecklist({ readiness }: { readiness: EventReadiness }) {
  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
            Venue arrangements
          </h2>
          <ReadinessBadge status={readiness.venueArrangementStatus} />
        </div>
        {readiness.venues.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No active venue booking for this event.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {readiness.venues.map((booking) => (
              <li key={booking.bookingId} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-sm text-slate-800">
                  {booking.venueName}
                  {booking.isMainVenue && (
                    <span className="ml-2 text-xs font-medium text-slate-400">Main venue</span>
                  )}
                </span>
                <ReadinessBadge status={booking.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
            Equipment arrangements
          </h2>
          <ReadinessBadge status={readiness.equipmentArrangementStatus} />
        </div>
        {readiness.equipment.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No equipment was requested for this event.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {readiness.equipment.map((requirement) => (
              <li
                key={requirement.requirementId}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="text-sm text-slate-800">{requirement.equipmentName}</span>
                <ReadinessBadge status={requirement.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
