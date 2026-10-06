import { supabase } from "@/lib/supabase-client";

export type VenueAvailabilityStatus = "pending" | "on_hold" | "confirmed" | "blocked";

export type VenueAvailabilityPeriod = {
  id: string;
  type: VenueAvailabilityStatus;
  startsAt: string;
  endsAt: string;
  // Event title for a booking; reason for an operational block.
  label: string | null;
  // Who booked the event (the organiser) — null for an operational block,
  // which has no event.
  organiserName: string | null;
  // The event's assigned coordinator — venue_bookings.requested_by is
  // always the assigned coordinator (submit_venue_booking_request only lets
  // them submit), never the organiser.
  coordinatorName: string | null;
  // Only meaningful for an On Hold booking: the Venue Staff member who
  // placed it.
  heldByName: string | null;
  // Whether the signed-in viewer is the coordinator who requested this
  // booking. Always false for an operational block (it has no requester).
  // Only used to mask a Confirmed booking that isn't the viewer's own —
  // Pending/On Hold always show their real detail to every viewer.
  isMine: boolean;
};

function operationError(message: string) {
  return new Error(message);
}

/**
 * All periods that make a venue unavailable: pending/approved/on-hold
 * bookings (venue_bookings) and operational blocks (venue_unavailability).
 * Anything not covered by one of these is implicitly Available.
 *
 * `viewerId` is the signed-in user's id (auth.uid()) — only the assigned
 * coordinator can ever be a booking's requested_by
 * (submit_venue_booking_request enforces this), so comparing against it is
 * exactly "is this my event's booking" with no separate
 * events.assigned_coordinator_id lookup needed.
 */
export async function listVenueAvailability(
  venueId: string,
  viewerId: string | null,
): Promise<VenueAvailabilityPeriod[]> {
  const [bookings, blocks] = await Promise.all([
    supabase
      .from("venue_bookings")
      .select(
        `
          id, starts_at, ends_at, status, expires_at, requested_by,
          events (title, organiser:profiles!events_organiser_id_fkey (full_name)),
          coordinator:profiles!venue_bookings_requested_by_fkey (full_name),
          held_by:profiles!venue_bookings_held_by_fkey (full_name)
        `,
      )
      .eq("venue_id", venueId)
      .in("status", ["pending", "approved", "on_hold"]),
    supabase
      .from("venue_unavailability")
      .select("id, starts_at, ends_at, reason")
      .eq("venue_id", venueId)
      .is("removed_at", null),
  ]);

  if (bookings.error || blocks.error) {
    throw operationError("We couldn't load this venue's availability.");
  }

  // An On Hold row past its own expires_at hasn't necessarily been swept to
  // 'expired' yet (that only happens lazily, on the next write to this
  // venue) — computed live here instead of trusting the stored status, same
  // as find_matching_venues/search_available_venues do server-side.
  const bookingPeriods: VenueAvailabilityPeriod[] = bookings.data
    .filter((booking) => booking.status !== "on_hold" || new Date(booking.expires_at!) > new Date())
    .map((booking) => ({
      id: booking.id,
      type:
        booking.status === "approved"
          ? "confirmed"
          : booking.status === "on_hold"
            ? "on_hold"
            : "pending",
      startsAt: booking.starts_at,
      endsAt: booking.ends_at,
      label: booking.events?.title ?? "Booking",
      organiserName: booking.events?.organiser?.full_name ?? null,
      coordinatorName: booking.coordinator?.full_name ?? null,
      heldByName: booking.held_by?.full_name ?? null,
      isMine: viewerId !== null && booking.requested_by === viewerId,
    }));

  const blockedPeriods: VenueAvailabilityPeriod[] = blocks.data.map((block) => ({
    id: block.id,
    type: "blocked",
    startsAt: block.starts_at,
    endsAt: block.ends_at,
    label: block.reason?.trim() || "Reason not recorded",
    organiserName: null,
    coordinatorName: null,
    heldByName: null,
    isMine: false,
  }));

  return [...bookingPeriods, ...blockedPeriods];
}
