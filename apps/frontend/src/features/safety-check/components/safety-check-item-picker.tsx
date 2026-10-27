import { READINESS_STATUS_LABELS, type EventReadiness } from "@spm/shared";

import { READINESS_ITEM_BADGE_CLASSES } from "@/features/safety-check/services/event-readiness";
import { cn } from "@/lib/utils";

function ReadinessBadge({ status }: { status: keyof typeof READINESS_STATUS_LABELS }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide uppercase whitespace-nowrap",
        READINESS_ITEM_BADGE_CLASSES[status],
      )}
    >
      {READINESS_STATUS_LABELS[status]}
    </span>
  );
}

function MainVenueTag() {
  return (
    <span className="ml-2 inline-block rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
      Main
    </span>
  );
}

/**
 * AC2: the Safety Officer selects which venue bookings and equipment
 * arrangements are affected. Same per-item shape ReadinessChecklist
 * renders for the coordinator, with a checkbox added per item — plain
 * string[] toggle state owned by the parent (the same inline-fieldset
 * pattern RequestClarificationDialog already uses for a small fixed set),
 * not a separate reusable picker component, since this list isn't reused
 * anywhere else.
 */
export function SafetyCheckItemPicker({
  readiness,
  selectedBookingIds,
  onToggleBooking,
  selectedRequirementIds,
  onToggleRequirement,
  disabled = false,
}: {
  readiness: EventReadiness;
  selectedBookingIds: string[];
  onToggleBooking: (bookingId: string) => void;
  selectedRequirementIds: string[];
  onToggleRequirement: (requirementId: string) => void;
  disabled?: boolean;
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
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={selectedBookingIds.includes(booking.bookingId)}
                    onChange={() => onToggleBooking(booking.bookingId)}
                    disabled={disabled}
                    aria-label={`Flag ${booking.venueName}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center">
                      <span className="truncate text-sm font-medium text-slate-800">{booking.venueName}</span>
                      {booking.isMainVenue && <MainVenueTag />}
                    </span>
                    {booking.needsReviewReason && (
                      <span className="mt-0.5 block text-xs text-orange-700">{booking.needsReviewReason}</span>
                    )}
                  </span>
                </label>
                <ReadinessBadge status={booking.status} />
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
                <label className="flex min-w-0 flex-1 items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={selectedRequirementIds.includes(requirement.requirementId)}
                    onChange={() => onToggleRequirement(requirement.requirementId)}
                    disabled={disabled}
                    aria-label={`Flag ${requirement.equipmentName}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-slate-800">
                      {requirement.equipmentName} &times; {requirement.quantity}
                    </span>
                    {requirement.needsReviewReason && (
                      <span className="mt-0.5 block text-xs text-orange-700">{requirement.needsReviewReason}</span>
                    )}
                  </span>
                </label>
                <ReadinessBadge status={requirement.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
