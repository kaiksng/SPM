import type { UserRole } from "../types/role";

const ROLE_LABELS = {
  event_organiser: "Event Organiser",
  event_coordinator: "Event Coordinator",
  venue_staff: "Venue Staff",
  technical_support_staff: "Technical Support Staff",
  attendee: "Attendee",
} as const satisfies Record<UserRole, string>;

/** Human-readable label for a role, e.g. for display in the workspace UI. */
export function getRoleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
