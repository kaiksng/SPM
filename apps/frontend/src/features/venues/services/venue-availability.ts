import { supabase } from "@/lib/supabase-client";

export type VenueAvailabilityStatus = "pending" | "confirmed" | "blocked";

export type VenueAvailabilityPeriod = {
  id: string;
  type: VenueAvailabilityStatus;
  startsAt: string;
  endsAt: string;
  // Event title for a booking; reason for an operational block.
  label: string | null;
  // Whether the signed-in viewer is the coordinator who requested this
  // booking. Always false for an operational block (it has no requester) and
  // for Venue Staff/other coordinators viewing someone else's booking — the
  // page uses this to decide whether to show the real status/title or a
  // generic "booked, not available to you" treatment.
  isMine: boolean;
};

function operationError(message: string) {
  return new Error(message);
}

/**
 * All periods that make a venue unavailable: pending/approved bookings
 * (venue_bookings) and operational blocks (venue_unavailability). Anything
 * not covered by one of these is implicitly Available.
 *
 * `viewerId` is the signed-in user's id (auth.uid()) — only the assigned
 * coordinator can ever be a booking's requested_by (submit_venue_booking_request
 * enforces this), so comparing against it is exactly "is this my event's
 * booking" with no separate events.assigned_coordinator_id lookup needed.
 */
export async function listVenueAvailability(
  venueId: string,
  viewerId: string | null,
): Promise<VenueAvailabilityPeriod[]> {
  const [bookings, blocks] = await Promise.all([
    supabase
      .from("venue_bookings")
      .select("id, starts_at, ends_at, status, requested_by, events (title)")
      .eq("venue_id", venueId)
      .in("status", ["pending", "approved"]),
    supabase
      .from("venue_unavailability")
      .select("id, starts_at, ends_at, reason")
      .eq("venue_id", venueId)
      .is("removed_at", null),
  ]);

  if (bookings.error || blocks.error) {
    throw operationError("We couldn't load this venue's availability.");
  }

  const bookingPeriods: VenueAvailabilityPeriod[] = bookings.data.map((booking) => ({
    id: booking.id,
    type: booking.status === "approved" ? "confirmed" : "pending",
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    label: booking.events?.title ?? "Booking",
    isMine: viewerId !== null && booking.requested_by === viewerId,
  }));

  const blockedPeriods: VenueAvailabilityPeriod[] = blocks.data.map((block) => ({
    id: block.id,
    type: "blocked",
    startsAt: block.starts_at,
    endsAt: block.ends_at,
    label: block.reason?.trim() || "Reason not recorded",
    isMine: false,
  }));

  return [...bookingPeriods, ...blockedPeriods];
}
