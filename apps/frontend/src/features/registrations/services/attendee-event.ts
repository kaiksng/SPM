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

  if (error || !data) {
    throw new Error("This event is unavailable or you do not have access to it.");
  }

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
