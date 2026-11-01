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

const ACTIVE_BOOKING_STATUSES = ["pending", "approved", "on_hold"] as const;

/**
 * One of the signed-in coordinator's venue bookings that has to move because
 * of a conflict, for the Venue issue badge and the Affected venue bookings
 * table, next to disruptions. `blockReason` is set when it overlaps a venue
 * block; otherwise it overlaps a booking made first.
 */
export type CoordinatorVenueConflict = {
  bookingId: string;
  eventId: string;
  eventTitle: string;
  venueName: string;
  bookingStartsAt: string;
  bookingEndsAt: string;
  blockReason: string | null;
  /** Whether a replacement has been requested (202611010015). */
  state: "replacement_required" | "replacement_requested";
};

/**
 * The signed-in coordinator's bookings that have to move: requested after the
 * booking they overlap, or overlapping a venue block. RLS limits the conflicts
 * to the coordinator's own events (202611010005); callers keep only the
 * events currently assigned to them.
 */
export async function listVenueConflictsForCoordinator(): Promise<CoordinatorVenueConflict[]> {
  const { data, error } = await supabase
    .from("venue_booking_conflicts")
    .select(
      `
        booking:venue_bookings!venue_booking_conflicts_booking_id_fkey!inner (
          id, event_id, status, starts_at, ends_at, events (title), venues (name)
        ),
        conflicting_block:venue_unavailability!venue_booking_conflicts_conflicting_block_id_fkey (reason)
      `,
    )
    .is("resolved_at", null)
    .eq("is_responsible", true)
    .in("booking.status", [...ACTIVE_BOOKING_STATUSES]);

  if (error) throw new Error("Venue conflicts are unavailable.");

  // One row per booking; a block is named over another booking if it has both.
  const byBooking = new Map<string, CoordinatorVenueConflict>();
  for (const row of data ?? []) {
    const existing = byBooking.get(row.booking.id);
    if (existing && (existing.blockReason !== null || !row.conflicting_block)) continue;
    byBooking.set(row.booking.id, {
      bookingId: row.booking.id,
      eventId: row.booking.event_id,
      eventTitle: row.booking.events?.title ?? "Unknown event",
      venueName: row.booking.venues?.name ?? "Unknown venue",
      bookingStartsAt: row.booking.starts_at,
      bookingEndsAt: row.booking.ends_at,
      blockReason: row.conflicting_block ? (row.conflicting_block.reason ?? "Reason not recorded") : null,
      state: "replacement_required",
    });
  }
  if (byBooking.size === 0) return [];

  const replacements = await supabase
    .from("venue_bookings")
    .select("replaces_booking_id")
    .in("replaces_booking_id", [...byBooking.keys()])
    .in("status", [...ACTIVE_BOOKING_STATUSES]);
  if (replacements.error) throw new Error("Venue conflicts are unavailable.");

  for (const row of replacements.data ?? []) {
    const item = row.replaces_booking_id ? byBooking.get(row.replaces_booking_id) : undefined;
    if (item) item.state = "replacement_requested";
  }

  return [...byBooking.values()];
}
