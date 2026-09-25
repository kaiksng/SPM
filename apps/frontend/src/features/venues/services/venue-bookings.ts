import type { Database } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type VenueBookingStatus = Database["public"]["Enums"]["request_status"];

export type ActiveVenueBooking = {
  id: string;
  venueId: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
  status: VenueBookingStatus;
};

function operationError(message: string) {
  return new Error(message);
}

/**
 * SPM-24: an event's current active (Pending/Approved) venue booking, if
 * any — AC04 means there is at most one, so a coordinator sees either that
 * one request or the suggestion list, never both.
 */
export async function getActiveVenueBooking(eventId: string): Promise<ActiveVenueBooking | null> {
  const { data, error } = await supabase
    .from("venue_bookings")
    .select("id, venue_id, starts_at, ends_at, status, venues (name)")
    .eq("event_id", eventId)
    .in("status", ["pending", "approved"])
    .maybeSingle();

  if (error) throw operationError("This event's venue booking status is unavailable.");
  if (!data) return null;

  return {
    id: data.id,
    venueId: data.venue_id,
    venueName: data.venues?.name ?? "Unknown venue",
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
  };
}

/**
 * Unlike most RPC callers in this codebase, this surfaces the database's own
 * exception text rather than a generic fallback — AC02/AC03/AC04/AC07
 * require the specific missing field or conflict to be identified to the
 * coordinator, and there's no client-side pre-check that already covers it
 * (find_matching_venues screens by capacity/date/location/layout/
 * accessibility/facilities, but not operating hours or the one-per-event
 * rule), so the raised message *is* the identification mechanism.
 */
export async function submitVenueBookingRequest(
  eventId: string,
  venueId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("submit_venue_booking_request", {
    p_event_id: eventId,
    p_venue_id: venueId,
  });

  if (error || !data) {
    throw new Error(error?.message ?? "This venue booking request could not be submitted.");
  }

  return data;
}

export async function withdrawVenueBookingRequest(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_venue_booking_request", {
    p_booking_id: bookingId,
  });

  if (error) {
    throw new Error(error.message || "This venue booking request could not be withdrawn.");
  }
}
