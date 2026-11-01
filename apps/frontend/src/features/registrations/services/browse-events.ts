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
 * Every confirmed event — RLS (can_view_event) scopes visibility for the
 * attendee role to events with status = 'confirmed'. Events that don't take
 * registrations are included too (state "not_required"), so attendees see
 * everything that's on, the same list as the public main page.
 */
export async function listBrowseEvents(attendeeId: string): Promise<BrowseEventSummary[]> {
  const { data, error } = await supabase
    .from("events")
    .select(
      `
        id,
        title,
        banner_path,
        starts_at,
        ends_at,
        event_venue_requirements ( preferred_location ),
        event_registration_requirements (
          registration_required,
          registration_opens_at,
          registration_closes_at,
          attendee_capacity,
          waitlist_enabled
        )
      `,
    )
    .eq("status", "confirmed")
    .order("starts_at", { ascending: true });

  if (error) throw new Error("We couldn't load events.");

  // Confirmed events now back under review (a venue change, a change
  // request): read through a function that returns only attendee-safe fields.
  const { data: updating, error: updatingError } = await supabase.rpc("attendee_events_being_updated", {});
  if (updatingError) throw new Error("We couldn't load events.");

  const eventIds = [...data.map((event) => event.id), ...(updating ?? []).map((event) => event.id)];
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

  const confirmed = data.map((event): BrowseEventSummary => {
    const req = event.event_registration_requirements;
    const registeredCount = counts.get(event.id)?.registeredCount ?? 0;
    const required = req?.registration_required ?? false;
    // Registration details only mean something when the event takes them.
    const availability = {
      required,
      opensAt: required ? (req?.registration_opens_at ?? null) : null,
      closesAt: required ? (req?.registration_closes_at ?? null) : null,
      capacity: required ? (req?.attendee_capacity ?? null) : null,
    };
    return {
      id: event.id,
      title: event.title,
      bannerPath: event.banner_path,
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
