import {
  computeRegistrationState,
  type OwnRegistrationStatus,
  type RegistrationState,
} from "@spm/shared";

import { loadRegistrationCounts } from "@/features/registrations/services/registrations";
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
  waitlistEnabled: boolean;
  waitlistPosition: number | null;
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
          attendee_capacity,
          waitlist_enabled
        )
      `,
    )
    .eq("status", "confirmed")
    .eq("event_registration_requirements.registration_required", true)
    .order("starts_at", { ascending: true });

  if (error) throw new Error("We couldn't load events.");

  const eventIds = data.map((event) => event.id);
  if (eventIds.length === 0) return [];

  // SPM-44: only the attendee's own rows are readable; places taken and the
  // attendee's waiting-list position come from loadRegistrationCounts.
  const [{ data: ownRegistrations, error: registrationsError }, counts] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("event_id, status")
      .in("event_id", eventIds)
      .eq("attendee_id", attendeeId),
    loadRegistrationCounts(eventIds).catch(() => null),
  ]);

  if (registrationsError || !counts) throw new Error("We couldn't load events.");

  const ownStatusByEvent = new Map<string, OwnRegistrationStatus>();
  for (const registration of ownRegistrations) {
    if (registration.status !== "withdrawn") {
      ownStatusByEvent.set(registration.event_id, registration.status as OwnRegistrationStatus);
    }
  }

  return data.map((event): BrowseEventSummary => {
    const req = event.event_registration_requirements;
    const registeredCount = counts.get(event.id)?.registeredCount ?? 0;
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
      waitlistEnabled: req?.waitlist_enabled ?? false,
      waitlistPosition: counts.get(event.id)?.ownWaitlistPosition ?? null,
      state: computeRegistrationState(
        availability,
        registeredCount,
        ownStatusByEvent.get(event.id) ?? null,
      ),
    };
  });
}
