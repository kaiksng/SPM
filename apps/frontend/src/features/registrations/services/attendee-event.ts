import { supabase } from "@/lib/supabase-client";
import { loadVisibleEvents } from "@/features/registrations/services/visible-events";

export type AttendeeEventVenue = {
  name: string;
  location: string;
  label: string | null;
  isMainVenue: boolean;
};

/** How a venue reads to an attendee, e.g. "Willow Room · Marina Bay". */
export function formatAttendeeVenue(venue: Pick<AttendeeEventVenue, "name" | "location">) {
  return venue.location ? `${venue.name} · ${venue.location}` : venue.name;
}

/**
 * The booked venues of the given events, for attendees: name, location,
 * label, main or not (public.attendee_event_venues, 202611010012). Extra
 * detail, so a failure leaves the events without venues instead of failing.
 */
export async function listAttendeeEventVenues(eventIds: string[]): Promise<Map<string, AttendeeEventVenue[]>> {
  const venues = new Map<string, AttendeeEventVenue[]>();
  if (eventIds.length === 0) return venues;
  let data;
  try {
    const result = await supabase.rpc("attendee_event_venues", { p_event_ids: eventIds });
    if (result.error) return venues;
    data = result.data;
  } catch {
    return venues;
  }
  for (const row of data ?? []) {
    const list = venues.get(row.event_id) ?? [];
    list.push({ name: row.venue_name, location: row.venue_location, label: row.label ?? null, isMainVenue: row.is_main_venue });
    venues.set(row.event_id, list);
  }
  return venues;
}

/** What an attendee sees about an event: nothing from internal planning. */
export type AttendeeEventDetail = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  organiserName: string | null;
  /** The organiser's optional banner image. */
  bannerPath: string | null;
  venue: { preferredLocation: string | null };
  /** The booked venues once Confirmed, main venue first; empty otherwise. */
  venues: AttendeeEventVenue[];
  registration: {
    required: boolean;
    opensAt: string | null;
    closesAt: string | null;
    capacity: number | null;
    waitlistEnabled: boolean;
    withdrawalPermitted: boolean;
  };
};

/**
 * SPM-44 AC05: the attendee-facing registration view's own loader. Unlike
 * loadEventDetail, it never asks for equipment, facilities, venue notes,
 * purpose, expected attendance or the coordinator, so none of that reaches
 * an attendee's browser.
 */
export async function loadAttendeeEventDetail(eventId: string): Promise<AttendeeEventDetail> {
  const [event] = await loadVisibleEvents([eventId]).catch(() => []);

  // Not visible as an ordinary attendee event: it may be a Confirmed event
  // back under review, which attendees still see through its attendee-safe
  // details.
  if (!event) return loadEventBeingUpdated(eventId);

  const venues = (await listAttendeeEventVenues([event.id])).get(event.id) ?? [];

  return {
    id: event.id,
    title: event.title,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    status: event.status,
    organiserName: event.organiserName,
    bannerPath: event.bannerPath,
    venue: { preferredLocation: event.preferredLocation },
    venues,
    registration: {
      required: event.registrationRequired ?? false,
      opensAt: event.registrationOpensAt,
      closesAt: event.registrationClosesAt,
      capacity: event.attendeeCapacity,
      waitlistEnabled: event.waitlistEnabled ?? false,
      withdrawalPermitted: event.withdrawalPermitted ?? false,
    },
  };
}

/** True when a Confirmed event is back under review: Planning or Pending Safety Check. */
export function isAttendeeEventBeingUpdated(status: string) {
  return status === "planning" || status === "pending_safety_check";
}

async function loadEventBeingUpdated(eventId: string): Promise<AttendeeEventDetail> {
  const { data, error } = await supabase.rpc("attendee_events_being_updated", { p_event_id: eventId });
  const event = data?.[0];
  if (error || !event) {
    throw new Error("This event is unavailable or you do not have access to it.");
  }
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    startsAt: event.starts_at ?? null,
    endsAt: event.ends_at ?? null,
    // Any re-review status reads the same to an attendee.
    status: "planning",
    organiserName: null,
    bannerPath: event.banner_path ?? null,
    venue: { preferredLocation: event.location ?? null },
    // Being updated: the venue is to be confirmed.
    venues: [],
    registration: {
      required: event.registration_required,
      opensAt: null,
      closesAt: null,
      capacity: null,
      waitlistEnabled: false,
      withdrawalPermitted: event.withdrawal_permitted,
    },
  };
}
