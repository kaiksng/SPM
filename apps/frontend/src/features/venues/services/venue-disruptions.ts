import {
  deriveVenueDisruptionState,
  type VenueBlockReasonCategory,
  type VenueDisruptionState,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type VenueDisruption = {
  id: string;
  bookingId: string;
  eventId: string;
  eventTitle: string;
  venueId: string;
  venueName: string;
  bookingStartsAt: string;
  bookingEndsAt: string;
  blockReasonCategory: VenueBlockReasonCategory;
  blockReason: string | null;
  blockStartsAt: string;
  blockEndsAt: string;
  flaggedAt: string;
  clearedAt: string | null;
  // SPM-82: the pending replacement for this booking, if one was requested.
  replacementBookingId: string | null;
  state: VenueDisruptionState;
};

const ACTIVE_BOOKING_STATUSES = new Set(["pending", "approved", "on_hold"]);

/**
 * SPM-83: the signed-in coordinator's events that have a venue booking
 * disrupted by a venue block. RLS limits the rows to disruptions on events
 * currently assigned to them. Open disruptions come first.
 */
export async function listVenueDisruptionsForCoordinator(): Promise<VenueDisruption[]> {
  const { data, error } = await supabase
    .from("venue_booking_disruptions")
    .select(
      `id, flagged_at, cleared_at,
       booking:venue_bookings!inner (
         id, event_id, venue_id, starts_at, ends_at, status,
         event:events!inner (title),
         venue:venues!inner (name)
       ),
       block:venue_unavailability!inner (reason_category, reason, starts_at, ends_at)`,
    )
    .order("flagged_at", { ascending: false });

  if (error) throw new Error("We couldn't load your affected venue bookings.");

  // SPM-82: which disrupted bookings already have a pending replacement.
  const bookingIds = (data ?? []).map((row) => row.booking.id);
  const pendingReplacements = new Map<string, string>();
  if (bookingIds.length > 0) {
    const { data: replacements, error: replacementError } = await supabase
      .from("venue_bookings")
      .select("id, replaces_booking_id")
      .in("replaces_booking_id", bookingIds)
      .eq("status", "pending");
    if (replacementError) throw new Error("We couldn't load your affected venue bookings.");
    for (const replacement of replacements ?? []) {
      if (replacement.replaces_booking_id) {
        pendingReplacements.set(replacement.replaces_booking_id, replacement.id);
      }
    }
  }

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      bookingId: row.booking.id,
      eventId: row.booking.event_id,
      eventTitle: row.booking.event.title,
      venueId: row.booking.venue_id,
      venueName: row.booking.venue.name,
      bookingStartsAt: row.booking.starts_at,
      bookingEndsAt: row.booking.ends_at,
      blockReasonCategory: row.block.reason_category,
      blockReason: row.block.reason,
      blockStartsAt: row.block.starts_at,
      blockEndsAt: row.block.ends_at,
      flaggedAt: row.flagged_at,
      clearedAt: row.cleared_at,
      replacementBookingId: pendingReplacements.get(row.booking.id) ?? null,
      state: deriveVenueDisruptionState({
        clearedAt: row.cleared_at,
        bookingActive: ACTIVE_BOOKING_STATUSES.has(row.booking.status),
        replacementRequested: pendingReplacements.has(row.booking.id),
      }),
    }))
    .sort((a, b) => Number(a.state === "resolved") - Number(b.state === "resolved"));
}
