import { computeRegistrationState, type RegistrationState } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type BrowseEventSummary = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  opensAt: string | null;
  closesAt: string | null;
  capacity: number | null;
  registeredCount: number;
  state: RegistrationState;
};

/**
 * Confirmed events that require registration — RLS (can_view_event) scopes
 * visibility for the attendee role to events with status = 'confirmed';
 * the registration_required filter on top of that is this query's own,
 * since an attendee has no reason to browse a confirmed event nobody needs
 * to register for.
 */
export async function listBrowseEvents(attendeeId: string): Promise<BrowseEventSummary[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      `
        id,
        title,
        starts_at,
        ends_at,
        event_venue_requirements ( preferred_location ),
        event_registration_requirements!inner (
          registration_required,
          registration_opens_at,
          registration_closes_at,
          attendee_capacity
        )
      `,
    )
    .eq("status", "confirmed")
    .eq("event_registration_requirements.registration_required", true)
    .order("starts_at", { ascending: true });

  if (error) throw new Error("We couldn't load events.");

  const eventIds = data.map((event) => event.id);
  if (eventIds.length === 0) return [];

  const { data: registrations, error: registrationsError } = await supabase
    .from("event_registrations")
    .select("event_id, attendee_id, status")
    .in("event_id", eventIds);

  if (registrationsError) throw new Error("We couldn't load events.");

  const registeredCounts = new Map<string, number>();
  const ownStatusByEvent = new Map<string, string>();
  for (const registration of registrations) {
    if (registration.status === "registered") {
      registeredCounts.set(
        registration.event_id,
        (registeredCounts.get(registration.event_id) ?? 0) + 1,
      );
    }
    if (registration.attendee_id === attendeeId) {
      ownStatusByEvent.set(registration.event_id, registration.status);
    }
  }

  return data.map((event): BrowseEventSummary => {
    const req = event.event_registration_requirements;
    const registeredCount = registeredCounts.get(event.id) ?? 0;
    const availability = {
      required: req?.registration_required ?? false,
      opensAt: req?.registration_opens_at ?? null,
      closesAt: req?.registration_closes_at ?? null,
      capacity: req?.attendee_capacity ?? null,
    };
    return {
      id: event.id,
      title: event.title,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      location: event.event_venue_requirements?.preferred_location ?? null,
      opensAt: availability.opensAt,
      closesAt: availability.closesAt,
      capacity: availability.capacity,
      registeredCount,
      state: computeRegistrationState(
        availability,
        registeredCount,
        ownStatusByEvent.get(event.id) === "registered",
      ),
    };
  });
}
