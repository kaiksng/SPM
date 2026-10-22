/**
 * Shared "what can this attendee do right now" computation for a single
 * event's registration, used by both the Browse Events list and the Event
 * Registration detail page so they never disagree about which state an
 * event is in. Scope for this story: direct registration only — no
 * waitlist join, no withdrawal, so "registered" is the only post-action
 * state this can report.
 */
export type RegistrationState =
  | "not_required"
  | "open"
  | "full"
  | "not_open"
  | "closed"
  | "registered";

export interface RegistrationAvailability {
  required: boolean;
  opensAt: string | null;
  closesAt: string | null;
  capacity: number | null;
}

export function computeRegistrationState(
  availability: RegistrationAvailability,
  registeredCount: number,
  isOwnRegistration: boolean,
  now: Date = new Date(),
): RegistrationState {
  if (!availability.required) return "not_required";
  if (isOwnRegistration) return "registered";
  if (availability.opensAt && now < new Date(availability.opensAt)) return "not_open";
  if (availability.closesAt && now > new Date(availability.closesAt)) return "closed";
  if (availability.capacity !== null && registeredCount >= availability.capacity) return "full";
  return "open";
}
