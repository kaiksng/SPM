import type { OwnRegistrationStatus } from "@spm/shared";

import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

/**
 * register_for_event re-checks the registration window, capacity and
 * duplicate-registration rules atomically, so this always goes through the
 * backend (service-role RPC) rather than a direct supabase-js insert — see
 * apps/backend/src/routes/event-registrations.route.ts. join/leave/withdraw
 * below go through the same route for the same reason.
 */
export async function registerForEvent(eventId: string) {
  return apiFetch(`/events/${eventId}/register`, { method: "POST" });
}

export async function joinWaitlist(eventId: string) {
  return apiFetch(`/events/${eventId}/waitlist`, { method: "POST" });
}

export async function leaveWaitlist(eventId: string) {
  return apiFetch(`/events/${eventId}/waitlist`, { method: "DELETE" });
}

/**
 * withdraw_registration promotes the longest-waiting attendee straight to
 * 'registered' in the same transaction — no invite/accept step. The reason
 * is optional — there's nothing to justify, unlike a safety-check decision.
 */
export async function withdrawRegistration(eventId: string, reason?: string) {
  return apiFetch(`/events/${eventId}/withdraw`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/** The current attendee's own registration status for one event, or null if they have none (or it's withdrawn). */
export async function getOwnRegistrationStatus(
  eventId: string,
  attendeeId: string,
): Promise<OwnRegistrationStatus> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("status, status_before_cancellation")
    .eq("event_id", eventId)
    .eq("attendee_id", attendeeId)
    .maybeSingle();

  if (error) throw new Error("We couldn't check your registration status.");
  if (!data || data.status === "withdrawn") return null;
  // The event was cancelled: what the attendee was when that happened, so
  // its page can say "You were registered" (202611010007).
  if (data.status === "event_cancelled") return data.status_before_cancellation as OwnRegistrationStatus;
  return data.status as OwnRegistrationStatus;
}

export type RegistrationCounts = {
  registeredCount: number;
  /** The signed-in attendee's 1-based waiting-list position, or null if they're not waitlisted. */
  ownWaitlistPosition: number | null;
};

/**
 * Places taken and the signed-in attendee's own waiting-list position, per
 * event. SPM-44: attendees can no longer read other attendees' registration
 * rows, so these numbers come from event_registration_counts, which returns
 * the numbers only (202610300003).
 */
export async function loadRegistrationCounts(eventIds: string[]): Promise<Map<string, RegistrationCounts>> {
  const counts = new Map<string, RegistrationCounts>();
  if (eventIds.length === 0) return counts;

  const { data, error } = await supabase.rpc("event_registration_counts", { p_event_ids: eventIds });
  if (error) throw new Error("We couldn't check this event's registrations.");

  for (const row of data ?? []) {
    counts.set(row.event_id, {
      registeredCount: row.registered_count,
      // Null when the attendee isn't waitlisted; the generated type can't say so.
      ownWaitlistPosition: row.own_waitlist_position ?? null,
    });
  }
  return counts;
}

/** How many attendees currently hold a 'registered' row for this event — used for the capacity bar. */
export async function getRegisteredCount(eventId: string) {
  const counts = await loadRegistrationCounts([eventId]).catch(() => {
    throw new Error("We couldn't check this event's capacity.");
  });
  return counts.get(eventId)?.registeredCount ?? 0;
}

/** The signed-in attendee's 1-based position in the waiting list (oldest first), or null if they're not waitlisted. */
export async function getWaitlistPosition(eventId: string) {
  const counts = await loadRegistrationCounts([eventId]).catch(() => {
    throw new Error("We couldn't check the waiting list.");
  });
  return counts.get(eventId)?.ownWaitlistPosition ?? null;
}

export type MyRegistration = {
  id: string;
  eventId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  status: string;
  /** For an "event_cancelled" registration: "registered" or "waitlisted" when the event was cancelled. */
  statusBeforeCancellation: string | null;
  registeredAt: string;
  waitlistPosition: number | null;
  withdrawalPermitted: boolean;
  /** A Confirmed event back under review: venue to be confirmed. */
  eventBeingUpdated: boolean;
};

/**
 * Every event the signed-in attendee has registered for or waitlisted for.
 * RLS already limits an attendee to their own rows (202610300003); the
 * explicit filter keeps this "my registrations" even for a signed-in
 * organiser or coordinator, who can also read the rows of events they manage.
 */
export async function listMyRegistrations(attendeeId: string): Promise<MyRegistration[]> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select(
      `
        id,
        status,
        status_before_cancellation,
        registered_at,
        event:events (
          id,
          title,
          status,
          starts_at,
          ends_at,
          event_venue_requirements ( preferred_location ),
          event_registration_requirements ( withdrawal_permitted )
        )
      `,
    )
    .eq("attendee_id", attendeeId)
    .order("registered_at", { ascending: false });

  if (error) throw new Error("We couldn't load your registrations.");

  const ownRows = data.filter((row) => row.event !== null);

  const waitlistedEventIds = ownRows
    .filter((row) => row.status === "waitlisted")
    .map((row) => row.event!.id);

  const counts = await loadRegistrationCounts(waitlistedEventIds).catch(() => {
    throw new Error("We couldn't check the waiting list.");
  });

  return ownRows.map((row) => {
    const eventId = row.event!.id;
    return {
      id: row.id,
      eventId,
      title: row.event!.title,
      startsAt: row.event!.starts_at,
      endsAt: row.event!.ends_at,
      location: row.event!.event_venue_requirements?.preferred_location ?? null,
      status: row.status,
      statusBeforeCancellation: row.status_before_cancellation,
      registeredAt: row.registered_at,
      waitlistPosition: counts.get(eventId)?.ownWaitlistPosition ?? null,
      withdrawalPermitted: row.event!.event_registration_requirements?.withdrawal_permitted ?? false,
      // A registration only exists once an event was Confirmed, so Planning
      // or Pending Safety Check here means it is being updated.
      eventBeingUpdated: row.event!.status === "planning" || row.event!.status === "pending_safety_check",
    };
  });
}

export type EventRegistrationEntry = {
  id: string;
  attendeeId: string;
  attendeeName: string | null;
  status: string;
  /** For an "event_cancelled" registration: "registered" or "waitlisted" when the event was cancelled. */
  statusBeforeCancellation: string | null;
  registeredAt: string;
  withdrawnAt: string | null;
  waitlistPosition: number | null;
};

/**
 * View Event Registration Information: every registration row for one
 * event, with the attendee's name — for the organiser, the assigned
 * coordinator, or the Event Coordinator Lead. RLS already scopes the rows
 * themselves to exactly those people (can_manage_event_registrations,
 * 202610300003), so any other caller gets no rows; the
 * attendee's name comes from a new, narrow profiles grant
 * (202610270006). No venue or equipment data is fetched here at all —
 * this is its own query, not the event-detail loader.
 */
export async function listEventRegistrations(eventId: string): Promise<EventRegistrationEntry[]> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select(
      `
        id, attendee_id, status, status_before_cancellation, registered_at, withdrawn_at,
        attendee:profiles!event_registrations_attendee_id_fkey ( full_name )
      `,
    )
    .eq("event_id", eventId)
    .order("registered_at", { ascending: true });

  if (error) throw new Error("We couldn't load this event's registrations.");

  const waitlisted = (data ?? []).filter((row) => row.status === "waitlisted");
  const waitlistPositions = new Map(waitlisted.map((row, index) => [row.id, index + 1]));

  return (data ?? []).map((row) => ({
    id: row.id,
    attendeeId: row.attendee_id,
    attendeeName: row.attendee?.full_name ?? null,
    status: row.status,
    statusBeforeCancellation: row.status_before_cancellation,
    registeredAt: row.registered_at,
    withdrawnAt: row.withdrawn_at,
    waitlistPosition: waitlistPositions.get(row.id) ?? null,
  }));
}
