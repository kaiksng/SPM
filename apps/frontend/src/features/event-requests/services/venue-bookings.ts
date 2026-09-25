import { supabase } from "@/lib/supabase-client";

export type Venue = {
  id: string;
  name: string;
  capacity: number;
  /** ISO 8601 weekday numbers the venue operates on: 1 = Monday .. 7 = Sunday. */
  operatingDays: number[];
  /** "HH:MM:SS", Asia/Singapore local time — see the migration for why. */
  operatingStartsTime: string;
  operatingEndsTime: string;
};

export async function listVenues(): Promise<Venue[]> {
  const { data, error } = await supabase
    .from("venues")
    .select("id, name, capacity, operating_days, operating_starts_time, operating_ends_time")
    .order("name", { ascending: true });

  if (error) {
    throw new Error("The venue directory is unavailable.");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    operatingDays: row.operating_days,
    operatingStartsTime: row.operating_starts_time,
    operatingEndsTime: row.operating_ends_time,
  }));
}

export type VenueBookingStatus = "pending" | "confirmed" | "rejected" | "withdrawn";

export type VenueBooking = {
  id: string;
  venueId: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
  status: VenueBookingStatus;
  createdAt: string;
};

/**
 * The event's current active request, if any — AC04's "one active booking
 * per event" rule means there is at most one row with this status filter,
 * so a coordinator sees either that one request (with a Withdraw action
 * while it's Pending) or the submission form, never both.
 */
export async function getActiveVenueBooking(eventId: string): Promise<VenueBooking | null> {
  const { data, error } = await supabase
    .from("venue_bookings")
    .select("id, venue_id, starts_at, ends_at, status, created_at, venue:venues (name)")
    .eq("event_id", eventId)
    .in("status", ["pending", "confirmed"])
    .maybeSingle();

  if (error) {
    throw new Error("This event's venue booking status is unavailable.");
  }
  if (!data) return null;

  return {
    id: data.id,
    venueId: data.venue_id,
    venueName: data.venue?.name ?? "Unknown venue",
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
    createdAt: data.created_at,
  };
}

/**
 * Unlike most RPC callers in this codebase, this surfaces the database's own
 * exception text rather than a generic fallback — AC02/AC03/AC04 require the
 * specific missing field or conflict to be identified to the coordinator,
 * and there's no client-side pre-check (e.g. a locked field) that already
 * covers it, so the raised message *is* the identification mechanism.
 */
export async function submitVenueBookingRequest(
  eventId: string,
  venueId: string,
  startsAt: string,
  endsAt: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("submit_venue_booking_request", {
    p_event_id: eventId,
    p_venue_id: venueId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
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
