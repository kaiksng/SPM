import { supabase } from "@/lib/supabase-client";

/**
 * An open conflict on one of an event's venue bookings, as Venue Staff's
 * re-check recorded it, for the coordinator's Venue step. Exactly one side
 * is set: another booking (its event and times) or a venue block.
 */
export type EventVenueConflict = {
  bookingId: string;
  /**
   * This booking has to move: it was requested after the booking it
   * overlaps, or it overlaps a venue block. The booking made first stays.
   */
  mustMove: boolean;
  conflictingEventTitle: string | null;
  conflictingStartsAt: string | null;
  conflictingEndsAt: string | null;
  blockReason: string | null;
  blockStartsAt: string | null;
  blockEndsAt: string | null;
  flaggedAt: string;
};

/**
 * The event's open venue conflicts (event_venue_conflicts, 202611010013).
 * Limited to the event's assigned coordinator, the Event Coordinator Lead and
 * Venue Staff; anyone else gets none.
 */
export async function listEventVenueConflicts(eventId: string): Promise<EventVenueConflict[]> {
  const { data, error } = await supabase.rpc("event_venue_conflicts", { p_event_id: eventId });

  if (error) throw new Error("This event's venue conflicts are unavailable.");

  return (data ?? []).map((row) => ({
    bookingId: row.booking_id,
    mustMove: row.must_move,
    conflictingEventTitle: row.conflicting_event_title ?? null,
    conflictingStartsAt: row.conflicting_starts_at ?? null,
    conflictingEndsAt: row.conflicting_ends_at ?? null,
    blockReason: row.block_reason ?? null,
    blockStartsAt: row.block_starts_at ?? null,
    blockEndsAt: row.block_ends_at ?? null,
    flaggedAt: row.flagged_at,
  }));
}

/**
 * The signed-in coordinator's events with a venue booking that has to move:
 * it was booked after the booking it overlaps, or it overlaps a venue block.
 * For the badge on their events list. RLS limits the conflicts to the
 * coordinator's own events (202611010005), so this needs no extra filter.
 */
export async function listEventIdsWithVenueConflict(): Promise<string[]> {
  const { data, error } = await supabase
    .from("venue_booking_conflicts")
    .select("booking:venue_bookings!venue_booking_conflicts_booking_id_fkey!inner (event_id, status)")
    .is("resolved_at", null)
    .eq("is_responsible", true)
    .in("booking.status", ["pending", "approved", "on_hold"]);

  if (error) throw new Error("Venue conflicts are unavailable.");

  return [...new Set((data ?? []).map((row) => row.booking.event_id))];
}
