import type { Database } from "@spm/shared";

import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

export type VenueBookingStatus = Database["public"]["Enums"]["request_status"];
export type VenueBookingDecision = "approved" | "rejected";

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

export type VenueBookingRequestSummary = {
  id: string;
  status: VenueBookingStatus;
  startsAt: string;
  endsAt: string;
  requestedAt: string;
  decidedAt: string | null;
  decisionNotes: string | null;
  venueId: string;
  venueName: string;
  venueLayouts: string[];
  eventId: string;
  eventTitle: string;
  eventExpectedAttendance: number | null;
  requestedByName: string | null;
  decidedByName: string | null;
};

const VENUE_BOOKING_REQUEST_SELECT = `
  id,
  status,
  starts_at,
  ends_at,
  requested_at,
  decided_at,
  decision_notes,
  venue_id,
  venues (name, venue_layouts (layout_name)),
  event_id,
  events (title, expected_attendance),
  requested_by:profiles!venue_bookings_requested_by_fkey (full_name),
  decided_by:profiles!venue_bookings_decided_by_fkey (full_name)
`;

function toVenueBookingRequestSummary(
  row: {
    id: string;
    status: VenueBookingStatus;
    starts_at: string;
    ends_at: string;
    requested_at: string;
    decided_at: string | null;
    decision_notes: string | null;
    venue_id: string;
    venues: { name: string; venue_layouts: { layout_name: string }[] } | null;
    event_id: string;
    events: { title: string; expected_attendance: number | null } | null;
    requested_by: { full_name: string } | null;
    decided_by: { full_name: string } | null;
  },
): VenueBookingRequestSummary {
  return {
    id: row.id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decisionNotes: row.decision_notes,
    venueId: row.venue_id,
    venueName: row.venues?.name ?? "Unknown venue",
    venueLayouts: (row.venues?.venue_layouts ?? []).map((layout) => layout.layout_name),
    eventId: row.event_id,
    eventTitle: row.events?.title ?? "Unknown event",
    eventExpectedAttendance: row.events?.expected_attendance ?? null,
    requestedByName: row.requested_by?.full_name ?? null,
    decidedByName: row.decided_by?.full_name ?? null,
  };
}

/**
 * Every venue booking request, newest first — Venue Staff's "Requests" tab.
 * RLS's "venue bookings visible to participants" already grants venue_staff
 * unrestricted select on this table, so this reads straight through Supabase
 * rather than the backend.
 */
export async function listVenueBookingRequests(): Promise<VenueBookingRequestSummary[]> {
  const { data, error } = await supabase
    .from("venue_bookings")
    .select(VENUE_BOOKING_REQUEST_SELECT)
    .order("requested_at", { ascending: false });

  if (error) throw new Error("Venue booking requests are unavailable.");

  return (data ?? []).map(toVenueBookingRequestSummary);
}

export async function getVenueBookingRequest(
  bookingId: string,
): Promise<VenueBookingRequestSummary> {
  const { data, error } = await supabase
    .from("venue_bookings")
    .select(VENUE_BOOKING_REQUEST_SELECT)
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !data) {
    throw new Error("This venue booking request is unavailable or you do not have access to it.");
  }

  return toVenueBookingRequestSummary(data);
}

/**
 * Inserts a `notifications` row for the requesting coordinator, which has no
 * INSERT policy for regular users, so this goes through apps/backend's
 * service client — same reasoning as decideEvent in
 * features/event-requests/services/decisions.ts.
 */
export async function decideVenueBookingRequest(
  bookingId: string,
  decision: VenueBookingDecision,
  reason: string,
) {
  return apiFetch(`/venue-bookings/${bookingId}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, reason }),
  });
}
