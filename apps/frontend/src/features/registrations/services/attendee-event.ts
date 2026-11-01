import { supabase } from "@/lib/supabase-client";

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
  const { data, error } = await supabase
    .from("events")
    .select(
      `
        id,
        title,
        description,
        starts_at,
        ends_at,
        status,
        banner_path,
        organiser:profiles!events_organiser_id_fkey (full_name),
        event_venue_requirements (preferred_location),
        event_registration_requirements (
          registration_required,
          registration_opens_at,
          registration_closes_at,
          attendee_capacity,
          waitlist_enabled,
          withdrawal_permitted
        )
      `,
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error) {
    throw new Error("This event is unavailable or you do not have access to it.");
  }
  // Not readable directly: it may be a Confirmed event back under review,
  // which attendees still see through its attendee-safe details.
  if (!data) return loadEventBeingUpdated(eventId);

  const registration = data.event_registration_requirements;

  return {
    id: data.id,
    title: data.title,
    description: data.description,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
    organiserName: data.organiser?.full_name ?? null,
    bannerPath: data.banner_path,
    venue: { preferredLocation: data.event_venue_requirements?.preferred_location ?? null },
    registration: {
      required: registration?.registration_required ?? false,
      opensAt: registration?.registration_opens_at ?? null,
      closesAt: registration?.registration_closes_at ?? null,
      capacity: registration?.attendee_capacity ?? null,
      waitlistEnabled: registration?.waitlist_enabled ?? false,
      withdrawalPermitted: registration?.withdrawal_permitted ?? false,
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
