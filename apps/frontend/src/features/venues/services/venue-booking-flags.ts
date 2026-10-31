import { supabase } from "@/lib/supabase-client";

/**
 * Something that flagged one of an event's venue bookings, and whether it
 * has been cleared since:
 *   conflict   — SPM-88: the booking overlaps another booking or a venue
 *                block once setup/turnaround time is applied;
 *   disruption — SPM-83: a venue block was recorded over the booking.
 */
export type VenueBookingFlag = {
  id: string;
  kind: "conflict" | "disruption";
  bookingId: string;
  /** The other side: another booking's event, or a venue block. */
  conflictingEventTitle: string | null;
  blockReason: string | null;
  blockStartsAt: string | null;
  blockEndsAt: string | null;
  flaggedAt: string;
  flaggedByName: string | null;
  clearedAt: string | null;
  clearedByName: string | null;
};

/**
 * SPM-9: every conflict and disruption on an event's venue bookings, open
 * and cleared, for its change history. RLS limits the rows to Venue Staff,
 * the Event Coordinator Lead and the event's assigned coordinator
 * (202610120003, 202611010001); anyone else gets none.
 */
export async function listVenueBookingFlagsForEvent(eventId: string): Promise<VenueBookingFlag[]> {
  const [conflicts, disruptions] = await Promise.all([
    supabase
      .from("venue_booking_conflicts")
      .select(
        `
          id, flagged_at, resolved_at,
          booking:venue_bookings!venue_booking_conflicts_booking_id_fkey!inner (id, event_id),
          conflicting_booking:venue_bookings!venue_booking_conflicts_conflicting_booking_id_fkey (
            events (title)
          ),
          conflicting_block:venue_unavailability!venue_booking_conflicts_conflicting_block_id_fkey (
            reason, starts_at, ends_at
          ),
          flagged_by_profile:profiles!venue_booking_conflicts_flagged_by_fkey (full_name),
          resolved_by_profile:profiles!venue_booking_conflicts_resolved_by_fkey (full_name)
        `,
      )
      .eq("booking.event_id", eventId),
    supabase
      .from("venue_booking_disruptions")
      .select(
        `
          id, flagged_at, cleared_at,
          booking:venue_bookings!inner (id, event_id),
          block:venue_unavailability!inner (reason, starts_at, ends_at),
          flagged_by_profile:profiles!venue_booking_disruptions_flagged_by_fkey (full_name),
          cleared_by_profile:profiles!venue_booking_disruptions_cleared_by_fkey (full_name)
        `,
      )
      .eq("booking.event_id", eventId),
  ]);

  if (conflicts.error || disruptions.error) {
    throw new Error("This event's venue conflicts and disruptions are unavailable.");
  }

  return [
    ...(conflicts.data ?? []).map(
      (row): VenueBookingFlag => ({
        id: `conflict-${row.id}`,
        kind: "conflict",
        bookingId: row.booking.id,
        conflictingEventTitle: row.conflicting_booking?.events?.title ?? null,
        blockReason: row.conflicting_block?.reason ?? null,
        blockStartsAt: row.conflicting_block?.starts_at ?? null,
        blockEndsAt: row.conflicting_block?.ends_at ?? null,
        flaggedAt: row.flagged_at,
        flaggedByName: row.flagged_by_profile?.full_name ?? null,
        clearedAt: row.resolved_at,
        clearedByName: row.resolved_by_profile?.full_name ?? null,
      }),
    ),
    ...(disruptions.data ?? []).map(
      (row): VenueBookingFlag => ({
        id: `disruption-${row.id}`,
        kind: "disruption",
        bookingId: row.booking.id,
        conflictingEventTitle: null,
        blockReason: row.block.reason,
        blockStartsAt: row.block.starts_at,
        blockEndsAt: row.block.ends_at,
        flaggedAt: row.flagged_at,
        flaggedByName: row.flagged_by_profile?.full_name ?? null,
        clearedAt: row.cleared_at,
        clearedByName: row.cleared_by_profile?.full_name ?? null,
      }),
    ),
  ];
}
