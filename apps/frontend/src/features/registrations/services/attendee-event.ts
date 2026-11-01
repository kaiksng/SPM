import { loadVisibleEvents } from "@/features/registrations/services/visible-events";

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
  const [event] = await loadVisibleEvents([eventId]).catch(() => []);

  if (!event) {
    throw new Error("This event is unavailable or you do not have access to it.");
  }

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
