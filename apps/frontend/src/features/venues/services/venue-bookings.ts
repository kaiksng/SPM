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
  // Only meaningful while status is "on_hold" — the deadline by which the
  // coordinator must confirm or the hold lapses on its own.
  expiresAt: string | null;
};

function operationError(message: string) {
  return new Error(message);
}

/**
 * The real row may still say "on_hold" after its deadline has passed — the
 * underlying status only flips to "expired" lazily, via
 * expire_stale_venue_holds, the next time something writes to that venue
 * (a new request, a new block). Reads never trigger that sweep, so this
 * computes the same thing live for display, same approach
 * find_matching_venues/search_available_venues already use server-side and
 * listVenueAvailability uses for the calendar.
 */
function effectiveBookingStatus(
  status: VenueBookingStatus,
  expiresAt: string | null,
): VenueBookingStatus {
  if (status === "on_hold" && expiresAt && new Date(expiresAt) <= new Date()) {
    return "expired";
  }
  return status;
}

/**
 * SPM-24: an event's current active (Pending/Approved/On Hold) venue
 * booking, if any — AC04 means there is at most one, so a coordinator sees
 * either that one request or the suggestion list, never both.
 */
export async function getActiveVenueBooking(eventId: string): Promise<ActiveVenueBooking | null> {
  const { data, error } = await supabase
    .from("venue_bookings")
    .select("id, venue_id, starts_at, ends_at, status, expires_at, venues (name)")
    .eq("event_id", eventId)
    .in("status", ["pending", "approved", "on_hold"])
    .maybeSingle();

  if (error) throw operationError("This event's venue booking status is unavailable.");
  if (!data) return null;

  return {
    id: data.id,
    venueId: data.venue_id,
    venueName: data.venues?.name ?? "Unknown venue",
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: effectiveBookingStatus(data.status, data.expires_at),
    expiresAt: data.expires_at,
  };
}

/**
 * Surfaces the database's own exception text rather than a generic
 * fallback — AC02/AC03/AC04/AC07 require the specific missing field or
 * conflict to be identified to the coordinator, and there's no client-side
 * pre-check that already covers it (find_matching_venues screens by
 * capacity/date/location/layout/accessibility/facilities, but not operating
 * hours or the one-per-event rule), so the raised message *is* the
 * identification mechanism — preserved through apiFetch/ApplicationError the
 * same way decideVenueBookingRequest's rationale errors are.
 *
 * Goes through apps/backend's service client, not a direct supabase-js call:
 * submit_venue_booking_request now inserts a `notifications` row for every
 * venue-staff profile, which has no INSERT policy for regular users — same
 * reasoning as decideVenueBookingRequest below.
 */
export async function submitVenueBookingRequest(
  eventId: string,
  venueId: string,
): Promise<string> {
  const { data } = await apiFetch("/venue-bookings/submit", {
    method: "POST",
    body: JSON.stringify({ eventId, venueId }),
  });

  return data as string;
}

export async function withdrawVenueBookingRequest(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("withdraw_venue_booking_request", {
    p_booking_id: bookingId,
  });

  if (error) {
    throw new Error(error.message || "This venue booking request could not be withdrawn.");
  }
}

/**
 * Venue Staff pauses a Pending request instead of deciding right away —
 * surfaces the database's own message, same reasoning as
 * submitVenueBookingRequest (the expiry-before-period-starts rule is only
 * actually enforced server-side).
 */
export async function placeVenueBookingHold(
  bookingId: string,
  expiresAt: string,
): Promise<void> {
  const { error } = await supabase.rpc("place_venue_booking_hold", {
    p_booking_id: bookingId,
    p_expires_at: expiresAt,
  });

  if (error) {
    throw new Error(error.message || "This request could not be put on hold.");
  }
}

/** The requesting coordinator confirms an On Hold request before its deadline. */
export async function confirmVenueBookingHold(bookingId: string): Promise<void> {
  const { error } = await supabase.rpc("confirm_venue_booking_hold", {
    p_booking_id: bookingId,
  });

  if (error) {
    throw new Error(error.message || "This hold could not be confirmed.");
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
  // Only meaningful while status is "on_hold".
  expiresAt: string | null;
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
  expires_at,
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
    expires_at: string | null;
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
    status: effectiveBookingStatus(row.status, row.expires_at),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decisionNotes: row.decision_notes,
    expiresAt: row.expires_at,
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
