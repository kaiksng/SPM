import type { VenueBookingStatus } from "@/features/venues/services/venue-bookings";

const VENUE_BOOKING_STATUS_CLASSES: Record<VenueBookingStatus, string> = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-500",
  on_hold: "border-indigo-200 bg-indigo-50 text-indigo-700",
  expired: "border-orange-200 bg-orange-50 text-orange-800",
};

/**
 * "Approved" reads as "Confirmed Booking" — the venue period is now
 * committed, which is what the status change actually means to whoever
 * requested or decided it. Same label-override convention as
 * status-badges.tsx's STATUS_LABELS for events.
 */
const VENUE_BOOKING_STATUS_LABELS: Record<VenueBookingStatus, string> = {
  pending: "Pending",
  approved: "Confirmed Booking",
  rejected: "Rejected",
  cancelled: "Cancelled",
  on_hold: "On Hold",
  expired: "Expired",
};

export function VenueBookingStatusBadge({ status }: { status: VenueBookingStatus }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${VENUE_BOOKING_STATUS_CLASSES[status]}`}
    >
      {VENUE_BOOKING_STATUS_LABELS[status]}
    </span>
  );
}
