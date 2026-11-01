import {
  computeRegistrationState,
  type OwnRegistrationStatus,
  type RegistrationState,
} from "@spm/shared";

import { formatAttendeeVenue, listAttendeeEventVenues } from "@/features/registrations/services/attendee-event";
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
  /** A Confirmed event back under review: venue to be confirmed, registration paused. */
  beingUpdated: boolean;
};

/**
 * Every confirmed event, read through attendee_visible_events (an attendee
 * has no direct read access to the events table). Events that don't take
 * registrations are included too (state "not_required"), so attendees see
 * everything that's on, the same list as the public main page.
 */
export async function listBrowseEvents(attendeeId: string): Promise<BrowseEventSummary[]> {
  const data = (await loadVisibleEvents()).filter((event) => event.status === "confirmed");

  // Confirmed events now back under review (a venue change, a change
  // request): read through a function that returns only attendee-safe fields.
  const { data: updating, error: updatingError } = await supabase.rpc("attendee_events_being_updated", {});
  if (updatingError) throw new Error("We couldn't load events.");

  const eventIds = [...data.map((event) => event.id), ...(updating ?? []).map((event) => event.id)];
  if (eventIds.length === 0) return [];

  // SPM-44: only the attendee's own rows are readable; places taken and the
  // attendee's waiting-list position come from loadRegistrationCounts.
  const [{ data: ownRegistrations, error: registrationsError }, counts, venues] = await Promise.all([
    supabase
      .from("event_registrations")
      .select("event_id, status")
      .in("event_id", eventIds)
      .eq("attendee_id", attendeeId),
    loadRegistrationCounts(eventIds).catch(() => null),
    listAttendeeEventVenues(data.map((event) => event.id)),
  ]);

  if (registrationsError || !counts) throw new Error("We couldn't load events.");

  const ownStatusByEvent = new Map<string, OwnRegistrationStatus>();
  for (const registration of ownRegistrations) {
    if (registration.status !== "withdrawn") {
      ownStatusByEvent.set(registration.event_id, registration.status as OwnRegistrationStatus);
    }
  }

  const confirmed = data.map((event): BrowseEventSummary => {
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
      // The booked main venue once Confirmed; else the organiser's preferred area.
      location: mainVenueLocation(venues.get(event.id)) ?? event.preferredLocation,
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
      beingUpdated: false,
    };
  });

  const beingUpdated = (updating ?? []).map((event): BrowseEventSummary => {
    const ownStatus = ownStatusByEvent.get(event.id) ?? null;
    return {
      id: event.id,
      title: event.title,
      bannerPath: event.banner_path ?? null,
      startsAt: event.starts_at ?? null,
      endsAt: event.ends_at ?? null,
      location: event.location ?? null,
      opensAt: null,
      closesAt: null,
      capacity: null,
      registeredCount: 0,
      waitlistEnabled: false,
      waitlistPosition: counts.get(event.id)?.ownWaitlistPosition ?? null,
      // Registration is paused; the attendee's own place still shows.
      state: ownStatus ?? (event.registration_required ? "closed" : "not_required"),
      beingUpdated: true,
    };
  });

  return [...confirmed, ...beingUpdated].sort((left, right) =>
    (left.startsAt ?? "\uffff").localeCompare(right.startsAt ?? "\uffff"),
  );
}

function mainVenueLocation(venues: { name: string; location: string; isMainVenue: boolean }[] | undefined) {
  const main = venues?.find((venue) => venue.isMainVenue) ?? venues?.[0];
  return main ? formatAttendeeVenue(main) : null;
}
