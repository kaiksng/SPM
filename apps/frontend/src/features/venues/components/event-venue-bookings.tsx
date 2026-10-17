import { useState } from "react";

import { Button } from "@/components/ui/button";
import { VenueBookingCancelDialog } from "@/features/venues/components/venue-booking-cancel-dialog";
import { VenueBookingStatusBadge } from "@/features/venues/components/venue-booking-status-badge";
import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const ACTIVE_STATUSES = new Set(["pending", "approved", "on_hold"]);

export function isActiveVenueBooking(booking: Pick<VenueBookingRequestSummary, "status">) {
  return ACTIVE_STATUSES.has(booking.status);
}

/**
 * SPM-85: every venue booking of an event — label, venue, period, headcount
 * and status — active ones first, then rejected, cancelled and expired ones
 * (kept visible so the coordinator sees what happened to them).
 */
export function EventVenueBookings({
  bookings,
  busyBookingId,
  actionError,
  canChangeMain,
  onWithdraw,
  onConfirmHold,
  onSetMain,
}: {
  bookings: VenueBookingRequestSummary[];
  busyBookingId?: string;
  actionError?: { bookingId: string; message: string };
  // The main venue can only be changed while the event is in Planning.
  canChangeMain: boolean;
  onWithdraw: (bookingId: string, reason: string) => Promise<unknown>;
  onConfirmHold: (bookingId: string) => void;
  onSetMain: (bookingId: string) => void;
}) {
  const [releasing, setReleasing] = useState<VenueBookingRequestSummary>();
  // A replacement carries its original's flag, so it is never chosen on its own.
  const active = bookings.filter((booking) => isActiveVenueBooking(booking) && !booking.replacesBookingId);
  const hasMain = active.some((booking) => booking.isMainVenue);
  const ordered = [...bookings].sort((a, b) => {
    const activeDifference = Number(isActiveVenueBooking(b)) - Number(isActiveVenueBooking(a));
    return activeDifference || a.startsAt.localeCompare(b.startsAt);
  });

  return (
    <section aria-label="Venue bookings" className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Venue bookings</h2>
      {active.length > 0 && !hasMain && (
        <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          This event has no main venue. Choose which booking is the main venue.
        </p>
      )}
      <ul className="mt-4 divide-y divide-slate-100">
        {ordered.map((booking) => (
          <li key={booking.id} className="py-4 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{booking.label}</span>
              {booking.isMainVenue && isActiveVenueBooking(booking) && !booking.replacesBookingId && (
                <span className="inline-block rounded-full border border-primary/30 bg-accent px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-primary">
                  Main venue
                </span>
              )}
              {booking.replacesBookingId && (
                <span className="inline-block rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap text-slate-600">
                  Replacement
                </span>
              )}
              <VenueBookingStatusBadge status={booking.status} />
            </div>
            <p className="mt-1 text-sm text-slate-800">{booking.venueName}</p>
            <p className="mt-1 text-sm text-slate-600">
              {dateTimeFormatter.format(new Date(booking.startsAt))}
              {" – "}
              {dateTimeFormatter.format(new Date(booking.endsAt))}
              {booking.expectedHeadcount != null && ` · ${booking.expectedHeadcount} people`}
            </p>
            {booking.status === "rejected" && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                <span className="font-semibold">
                  Rejected{booking.decidedByName ? ` by ${booking.decidedByName}` : ""}
                  {booking.decidedAt ? ` on ${dateTimeFormatter.format(new Date(booking.decidedAt))}` : ""}.
                </span>
                {booking.decisionNotes ? ` Reason: ${booking.decisionNotes}` : ""}
              </p>
            )}
            {booking.status === "expired" && (
              <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
                This hold expired before it was confirmed. The venue is available again, so search or pick a
                new suggestion to submit another request.
              </p>
            )}
            {booking.status === "on_hold" && booking.expiresAt && (
              <>
                <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                  Venue Staff put this request on hold. Confirm by{" "}
                  {dateTimeFormatter.format(new Date(booking.expiresAt))}, or it expires and the venue
                  becomes available to others again.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  disabled={busyBookingId === booking.id}
                  onClick={() => onConfirmHold(booking.id)}
                >
                  {busyBookingId === booking.id ? "Confirming…" : "Confirm request"}
                </Button>
              </>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {canChangeMain
                && isActiveVenueBooking(booking)
                && !booking.replacesBookingId
                && !booking.isMainVenue && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyBookingId === booking.id}
                    onClick={() => onSetMain(booking.id)}
                  >
                    Make main venue
                  </Button>
                )}
              {booking.status === "pending" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyBookingId === booking.id}
                  onClick={() => setReleasing(booking)}
                >
                  Withdraw request
                </Button>
              )}
              {booking.status === "approved" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busyBookingId === booking.id}
                  onClick={() => setReleasing(booking)}
                >
                  Cancel booking
                </Button>
              )}
            </div>
            {booking.cancellationReason && booking.status === "cancelled" && (
              <p className="mt-2 text-sm text-slate-500">Reason: {booking.cancellationReason}</p>
            )}
            {actionError?.bookingId === booking.id && (
              <p role="alert" className="mt-2 text-sm text-red-700">
                {actionError.message}
              </p>
            )}
          </li>
        ))}
      </ul>
      {releasing && (
        <VenueBookingCancelDialog
          mode={releasing.status === "approved" ? "cancel" : "withdraw"}
          bookingLabel={releasing.label}
          onCancel={() => setReleasing(undefined)}
          onSubmit={async (reason) => {
            await onWithdraw(releasing.id, reason);
            setReleasing(undefined);
          }}
        />
      )}
    </section>
  );
}
