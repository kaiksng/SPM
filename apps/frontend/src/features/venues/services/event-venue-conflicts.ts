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
  /** Open (with or without a requested replacement, 202611010015) or resolved. */
  state: "replacement_required" | "replacement_requested" | "resolved";
  resolvedAt: string | null;
};

/**
 * The signed-in coordinator's bookings that have to move: requested after the
 * booking they overlap, or overlapping a venue block. Open ones, and ones
 * resolved since `resolvedSince`, like disruptions. RLS limits the conflicts
 * to the coordinator's own events (202611010005); callers keep only the
 * events currently assigned to them.
 */
export async function listVenueConflictsForCoordinator(resolvedSince: string): Promise<CoordinatorVenueConflict[]> {
  const { data, error } = await supabase
    .from("venue_booking_conflicts")
    .select(
      `
        resolved_at,
        booking:venue_bookings!venue_booking_conflicts_booking_id_fkey!inner (
          id, event_id, status, starts_at, ends_at, events (title), venues (name)
        ),
        conflicting_block:venue_unavailability!venue_booking_conflicts_conflicting_block_id_fkey (reason)
      `,
    )
    .eq("is_responsible", true)
    .or(`resolved_at.is.null,resolved_at.gte.${resolvedSince}`);

  if (error) throw new Error("Venue conflicts are unavailable.");

  // One row per booking: open over resolved, a block over another booking,
  // and the latest resolution among resolved ones.
  const outranks = (item: CoordinatorVenueConflict, other: CoordinatorVenueConflict) => {
    const itemOpen = item.state !== "resolved";
    const otherOpen = other.state !== "resolved";
    if (itemOpen !== otherOpen) return itemOpen;
    if (itemOpen) return item.blockReason !== null && other.blockReason === null;
    return (item.resolvedAt ?? "") > (other.resolvedAt ?? "");
  };
  const byBooking = new Map<string, CoordinatorVenueConflict>();
  for (const row of data ?? []) {
    const active = (ACTIVE_BOOKING_STATUSES as readonly string[]).includes(row.booking.status);
    // A conflict still open on a booking released by hand no longer applies.
    if (row.resolved_at === null && !active) continue;
    const item: CoordinatorVenueConflict = {
      bookingId: row.booking.id,
      eventId: row.booking.event_id,
      eventTitle: row.booking.events?.title ?? "Unknown event",
      venueName: row.booking.venues?.name ?? "Unknown venue",
      bookingStartsAt: row.booking.starts_at,
      bookingEndsAt: row.booking.ends_at,
      blockReason: row.conflicting_block ? (row.conflicting_block.reason ?? "Reason not recorded") : null,
      state: row.resolved_at === null ? "replacement_required" : "resolved",
      resolvedAt: row.resolved_at,
    };
    const existing = byBooking.get(item.bookingId);
    if (!existing || outranks(item, existing)) byBooking.set(item.bookingId, item);
  }

  const openIds = [...byBooking.values()].filter((item) => item.state !== "resolved").map((item) => item.bookingId);
  if (openIds.length > 0) {
    const replacements = await supabase
      .from("venue_bookings")
      .select("replaces_booking_id")
      .in("replaces_booking_id", openIds)
      .in("status", [...ACTIVE_BOOKING_STATUSES]);
    if (replacements.error) throw new Error("Venue conflicts are unavailable.");

    for (const row of replacements.data ?? []) {
      const item = row.replaces_booking_id ? byBooking.get(row.replaces_booking_id) : undefined;
      if (item && item.state !== "resolved") item.state = "replacement_requested";
    }
  }

  return [...byBooking.values()];
}
