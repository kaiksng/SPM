import { supabase } from "@/lib/supabase-client";

export type VenueAvailabilityStatus = "pending" | "confirmed" | "blocked";

export type VenueAvailabilityPeriod = {
  id: string;
  type: VenueAvailabilityStatus;
  startsAt: string;
  endsAt: string;
  // The event title for a booking; always null for an operational block —
  // blocked periods show only their time range, never a reason.
  label: string | null;
};

function operationError(message: string) {
  return new Error(message);
}

/**
 * All periods that make a venue unavailable: pending/approved bookings
 * (venue_bookings) and operational blocks (venue_unavailability). Anything
 * not covered by one of these is implicitly Available.
 */
export async function listVenueAvailability(
  venueId: string,
): Promise<VenueAvailabilityPeriod[]> {
  const [bookings, blocks] = await Promise.all([
    supabase
      .from("venue_bookings")
      .select("id, starts_at, ends_at, status, events (title)")
      .eq("venue_id", venueId)
      .in("status", ["pending", "approved"]),
    supabase
      .from("venue_unavailability")
      .select("id, starts_at, ends_at")
      .eq("venue_id", venueId),
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
  }));

  const blockedPeriods: VenueAvailabilityPeriod[] = blocks.data.map((block) => ({
    id: block.id,
    type: "blocked",
    startsAt: block.starts_at,
    endsAt: block.ends_at,
    label: null,
  }));

  return [...bookingPeriods, ...blockedPeriods];
}
