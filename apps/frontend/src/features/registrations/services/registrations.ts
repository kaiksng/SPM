import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

/**
 * register_for_event re-checks the registration window, capacity and
 * duplicate-registration rules atomically, so this always goes through the
 * backend (service-role RPC) rather than a direct supabase-js insert — see
 * apps/backend/src/routes/event-registrations.route.ts.
 */
export async function registerForEvent(eventId: string) {
  return apiFetch(`/events/${eventId}/register`, { method: "POST" });
}

/** The current attendee's own registration status for one event, or null if they haven't registered. */
export async function getOwnRegistrationStatus(eventId: string, attendeeId: string) {
  const { data, error } = await supabase
    .from("event_registrations")
    .select("status")
    .eq("event_id", eventId)
    .eq("attendee_id", attendeeId)
    .maybeSingle();

  if (error) throw new Error("We couldn't check your registration status.");
  return data?.status ?? null;
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

export type MyRegistration = {
  id: string;
  eventId: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  status: string;
  registeredAt: string;
};

/** Every event the signed-in attendee has registered for — RLS already scopes this to their own rows. */
export async function listMyRegistrations(): Promise<MyRegistration[]> {
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
          event_venue_requirements ( preferred_location )
        )
      `,
    )
    .order("registered_at", { ascending: false });

  if (error) throw new Error("We couldn't load your registrations.");

  return data
    .filter((row) => row.event !== null)
    .map((row) => ({
      id: row.id,
      eventId: row.event!.id,
      title: row.event!.title,
      startsAt: row.event!.starts_at,
      endsAt: row.event!.ends_at,
      location: row.event!.event_venue_requirements?.preferred_location ?? null,
      status: row.status,
      registeredAt: row.registered_at,
    }));
}
