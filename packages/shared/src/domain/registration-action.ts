/**
 * What the organiser must do to an event's registration before it can go to
 * the safety check. Mirrors event_readiness's registration_incomplete and
 * registration_over_capacity checks (202610260002), which the database
 * enforces; this only decides what the organiser is shown.
 */
export type RegistrationAction = "setup" | "over_capacity";

export interface RegistrationSettingsSnapshot {
  required: boolean;
  opensAt: string | null;
  closesAt: string | null;
  capacity: number | null;
}

/** Whether the settings themselves are complete, without a venue to compare. */
export function isRegistrationSetupIncomplete(registration: RegistrationSettingsSnapshot) {
  return (
    registration.required &&
    (registration.opensAt === null || registration.closesAt === null || registration.capacity === null)
  );
}

/**
 * Only a Planning event: the organiser can change registration only then
 * (configure_event_registration), so earlier or later stages have nothing
 * for them to do. `venueCapacity` is the approved main venue's, or null when
 * there isn't one.
 */
export function registrationActionNeeded(
  status: string,
  registration: RegistrationSettingsSnapshot,
  venueCapacity: number | null,
): RegistrationAction | null {
  if (status !== "planning" || !registration.required) return null;
  if (isRegistrationSetupIncomplete(registration)) return "setup";
  if (venueCapacity !== null && registration.capacity !== null && registration.capacity > venueCapacity) {
    return "over_capacity";
  }
  return null;
}
