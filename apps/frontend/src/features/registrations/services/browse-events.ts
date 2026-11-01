import {
  computeRegistrationState,
  type OwnRegistrationStatus,
  type RegistrationState,
} from "@spm/shared";

import { loadRegistrationCounts } from "@/features/registrations/services/registrations";
import { supabase } from "@/lib/supabase-client";
import { loadVisibleEvents } from "@/features/registrations/services/visible-events";

export type BrowseEventSummary = {
  id: string;
  title: string;
  /** The organiser's optional banner image. */
  bannerPath: string | null;
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
 * Every confirmed event, read through attendee_visible_events (an attendee
 * has no direct read access to the events table). Events that don't take
 * registrations are included too (state "not_required"), so attendees see
 * everything that's on, the same list as the public main page.
 */
export async function listBrowseEvents(attendeeId: string): Promise<BrowseEventSummary[]> {
  const data = (await loadVisibleEvents()).filter((event) => event.status === "confirmed");

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
    const registeredCount = counts.get(event.id)?.registeredCount ?? 0;
    const required = event.registrationRequired ?? false;
    // Registration details only mean something when the event takes them.
    const availability = {
      required,
      opensAt: required ? event.registrationOpensAt : null,
      closesAt: required ? event.registrationClosesAt : null,
      capacity: required ? event.attendeeCapacity : null,
    };
    return {
      id: event.id,
      title: event.title,
      bannerPath: event.bannerPath,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      location: event.preferredLocation,
      opensAt: availability.opensAt,
      closesAt: availability.closesAt,
      capacity: availability.capacity,
      registeredCount,
      waitlistEnabled: event.waitlistEnabled ?? false,
      waitlistPosition: counts.get(event.id)?.ownWaitlistPosition ?? null,
      state: computeRegistrationState(
        availability,
        registeredCount,
        ownStatusByEvent.get(event.id) ?? null,
      ),
    };
  });
}
