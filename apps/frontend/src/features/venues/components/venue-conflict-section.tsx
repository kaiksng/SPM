import { VENUE_DISRUPTION_STATE_LABELS } from "@spm/shared";
import { AlertTriangle } from "lucide-react";

import type { EventVenueConflict } from "@/features/venues/services/event-venue-conflicts";
import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

function formatPeriod(startsAt: string | null, endsAt: string | null) {
  if (!startsAt || !endsAt) return "";
  return ` (${dateTimeFormatter.format(new Date(startsAt))} – ${dateTimeFormatter.format(new Date(endsAt))})`;
}

/**
 * A booking that has to move because of a conflict: it was requested after
 * the booking it overlaps, or it overlaps a venue block. Laid out like the
 * Disrupted venue booking section (SPM-82): the coordinator picks a
 * replacement below, and approving it releases this booking (202611010015).
 */
export function VenueConflictSection({
  booking,
  conflict,
  replacementRequested,
}: {
  booking: VenueBookingRequestSummary;
  conflict: EventVenueConflict;
  replacementRequested: boolean;
}) {
  return (
    <section aria-label="Venue conflict" className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold tracking-wide text-amber-900 uppercase">
        <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
        Venue conflict
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-900">{booking.venueName}</span>
        <span className="inline-block rounded-full border border-amber-200 bg-white px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-amber-800">
          {VENUE_DISRUPTION_STATE_LABELS[replacementRequested ? "replacement_requested" : "replacement_required"]}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600">
        {dateTimeFormatter.format(new Date(booking.startsAt))}
        {" – "}
        {dateTimeFormatter.format(new Date(booking.endsAt))}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {conflict.blockReason !== null
          ? `Overlaps the venue block "${conflict.blockReason}"${formatPeriod(conflict.blockStartsAt, conflict.blockEndsAt)}`
          : `Clashes with "${conflict.conflictingEventTitle ?? "another event"}"${formatPeriod(conflict.conflictingStartsAt, conflict.conflictingEndsAt)}, which was booked first,`}{" "}
        once the venue's setup and turnaround time is applied.
      </p>
      <p className="mt-3 text-sm text-slate-700">
        {replacementRequested
          ? "A replacement has been requested. This booking stays until Venue Staff approve it."
          : "This venue is no longer suitable for the event. Choose a different venue for the same period below."}
      </p>
    </section>
  );
}
