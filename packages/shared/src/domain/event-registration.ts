/**
 * Shared "what can this attendee do right now" computation for a single
 * event's registration, used by the Browse Events list, the Event
 * Registration detail page and My Registrations so they never disagree
 * about which state an event is in.
 */
export type RegistrationState =
  | "not_required"
  | "open"
  | "full"
  | "not_open"
  | "closed"
  | "registered"
  | "waitlisted";

export interface RegistrationAvailability {
  required: boolean;
  opensAt: string | null;
  closesAt: string | null;
  capacity: number | null;
}

/** The attendee's own row for this event, if any — null when they have none (or it's 'withdrawn'). */
export type OwnRegistrationStatus = "registered" | "waitlisted" | null;

export function computeRegistrationState(
  availability: RegistrationAvailability,
  registeredCount: number,
  ownStatus: OwnRegistrationStatus,
  now: Date = new Date(),
): RegistrationState {
  if (ownStatus === "registered") return "registered";
  if (ownStatus === "waitlisted") return "waitlisted";
  if (!availability.required) return "not_required";
  if (availability.opensAt && now < new Date(availability.opensAt)) return "not_open";
  if (availability.closesAt && now > new Date(availability.closesAt)) return "closed";
  if (availability.capacity !== null && registeredCount >= availability.capacity) {
    return "full";
  }
  return "open";
}
