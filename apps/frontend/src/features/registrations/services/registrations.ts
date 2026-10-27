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
    .select("status")
    .eq("event_id", eventId)
    .eq("attendee_id", attendeeId)
    .maybeSingle();

  if (error) throw new Error("We couldn't check your registration status.");
  if (!data || data.status === "withdrawn") return null;
  return data.status as OwnRegistrationStatus;
}

/** How many attendees currently hold a 'registered' row for this event — used for the capacity bar. */
export async function getRegisteredCount(eventId: string) {
  const { count, error } = await supabase
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "registered");

  if (error) throw new Error("We couldn't check this event's capacity.");
  return count ?? 0;
}

/** The attendee's 1-based position in the waiting list (oldest registered_at first), or null if they're not waitlisted. */
export async function getWaitlistPosition(eventId: string, attendeeId: string) {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("attendee_id")
    .eq("event_id", eventId)
    .eq("status", "waitlisted")
    .order("registered_at", { ascending: true });

  if (error) throw new Error("We couldn't check the waiting list.");
  const index = data.findIndex((row) => row.attendee_id === attendeeId);
  return index === -1 ? null : index + 1;
}

export type MyRegistration = {
  id: string;
  eventId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  status: string;
  registeredAt: string;
  waitlistPosition: number | null;
  withdrawalPermitted: boolean;
};

/**
 * Every event the signed-in attendee has registered for or waitlisted for.
 * Explicitly filtered to this attendee's own rows — event_registrations'
 * SELECT policy is `attendee_id = auth.uid() OR can_view_event(event_id)`,
 * and can_view_event grants any attendee read access to a confirmed event,
 * so without this filter the query would also return every other
 * attendee's rows on any confirmed event. (getOwnWaitlistPositions below
 * deliberately relies on that broader grant, scoped by its own explicit
 * event/status filters, to compute the attendee's position among peers.)
 */
export async function listMyRegistrations(attendeeId: string): Promise<MyRegistration[]> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select(
      `
        id,
        status,
        registered_at,
        event:events (
          id,
          title,
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

  const waitlistPositions =
    waitlistedEventIds.length === 0
      ? new Map<string, number>()
      : await getOwnWaitlistPositions(waitlistedEventIds, attendeeId);

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
      registeredAt: row.registered_at,
      waitlistPosition: waitlistPositions.get(eventId) ?? null,
      withdrawalPermitted: row.event!.event_registration_requirements?.withdrawal_permitted ?? false,
    };
  });
}

export type EventRegistrationEntry = {
  id: string;
  attendeeId: string;
  attendeeName: string | null;
  status: string;
  registeredAt: string;
  withdrawnAt: string | null;
  waitlistPosition: number | null;
};

/**
 * View Event Registration Information: every registration row for one
 * event, with the attendee's name — for the organiser, the assigned
 * coordinator, or the Event Coordinator Lead. RLS already scopes the rows
 * themselves (event_registrations delegates to can_view_event); the
 * attendee's name comes from a new, narrow profiles grant
 * (202610270006). No venue or equipment data is fetched here at all —
 * this is its own query, not the event-detail loader.
 */
export async function listEventRegistrations(eventId: string): Promise<EventRegistrationEntry[]> {
  const { data, error } = await supabase
    .from("event_registrations")
    .select(
      `
        id, attendee_id, status, registered_at, withdrawn_at,
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
    registeredAt: row.registered_at,
    withdrawnAt: row.withdrawn_at,
    waitlistPosition: waitlistPositions.get(row.id) ?? null,
  }));
}

async function getOwnWaitlistPositions(eventIds: string[], attendeeId: string) {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("event_id, attendee_id")
    .in("event_id", eventIds)
    .eq("status", "waitlisted")
    .order("registered_at", { ascending: true });

  if (error) throw new Error("We couldn't check the waiting list.");

  const positions = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const row of data) {
    const nextPosition = (counters.get(row.event_id) ?? 0) + 1;
    counters.set(row.event_id, nextPosition);
    if (row.attendee_id === attendeeId) {
      positions.set(row.event_id, nextPosition);
    }
  }
  return positions;
}
