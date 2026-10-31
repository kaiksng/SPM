import {
  READINESS_STATUS_LABELS,
  SAFETY_CHECK_FLAG_LABELS,
  SAFETY_CHECK_FLAGS,
  type EventReadiness,
  type SafetyCheckFlag,
} from "@spm/shared";

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
 * arrangements are affected — and (SPM-90) which of the coordinator's
 * safety checks, shown first in the Request changes dialog when
 * onToggleSafetyCheck is given. Same per-item shape ReadinessChecklist
 * renders for the coordinator. The review page uses readOnly; only the
 * Request changes dialog exposes checkboxes. Selection stays in the page
 * so only explicitly selected arrangements are sent with that decision.
 */
export function SafetyCheckItemPicker({
  readiness,
  selectedBookingIds = [],
  onToggleBooking,
  selectedRequirementIds = [],
  onToggleRequirement,
  selectedSafetyChecks = [],
  onToggleSafetyCheck,
  disabled = false,
  readOnly = false,
}: {
  readiness: EventReadiness;
  selectedBookingIds?: string[];
  onToggleBooking?: (bookingId: string) => void;
  selectedRequirementIds?: string[];
  onToggleRequirement?: (requirementId: string) => void;
  selectedSafetyChecks?: SafetyCheckFlag[];
  onToggleSafetyCheck?: (check: SafetyCheckFlag) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const ItemContainer = readOnly ? "div" : "label";
  // Equipment placement only applies when the event has equipment.
  const safetyChecks = SAFETY_CHECK_FLAGS.filter(
    (check) => check !== "equipment_placement" || readiness.equipment.length > 0,
  );
  return (
    <div className="mt-6 space-y-4">
      {!readOnly && onToggleSafetyCheck && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Safety checks</h2>
          <p className="mt-1 text-xs text-slate-500">
            The coordinator's checks. A flagged one is reopened for them to revise.
          </p>
          <ul className="mt-4 divide-y divide-slate-100">
            {safetyChecks.map((check) => (
              <li key={check} className="py-3 first:pt-0 last:pb-0">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={selectedSafetyChecks.includes(check)}
                    onChange={() => onToggleSafetyCheck(check)}
                    disabled={disabled}
                    aria-label={`Flag ${SAFETY_CHECK_FLAG_LABELS[check]}`}
                  />
                  <span className="text-sm font-medium text-slate-800">{SAFETY_CHECK_FLAG_LABELS[check]}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
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
                <ItemContainer className="flex min-w-0 flex-1 items-start gap-3">
                  {!readOnly && <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={selectedBookingIds.includes(booking.bookingId)}
                    onChange={() => onToggleBooking?.(booking.bookingId)}
                    disabled={disabled}
                    aria-label={`Flag ${booking.venueName}`}
                  />}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-y-1">
                      <span className="max-w-full break-words text-sm font-medium text-slate-800">{booking.venueName}</span>
                      {booking.isMainVenue && <MainVenueTag />}
                    </span>
                    {booking.needsReviewReason && (
                      <span className="mt-0.5 block text-xs text-orange-700">{booking.needsReviewReason}</span>
                    )}
                  </span>
                </ItemContainer>
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
                <ItemContainer className="flex min-w-0 flex-1 items-start gap-3">
                  {!readOnly && <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={selectedRequirementIds.includes(requirement.requirementId)}
                    onChange={() => onToggleRequirement?.(requirement.requirementId)}
                    disabled={disabled}
                    aria-label={`Flag ${requirement.equipmentName}`}
                  />}
                  <span className="min-w-0 flex-1">
                    <span className="max-w-full break-words text-sm font-medium text-slate-800">
                      {requirement.equipmentName} &times; {requirement.quantity}
                    </span>
                    {requirement.needsReviewReason && (
                      <span className="mt-0.5 block text-xs text-orange-700">{requirement.needsReviewReason}</span>
                    )}
                  </span>
                </ItemContainer>
                <ReadinessBadge status={requirement.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
