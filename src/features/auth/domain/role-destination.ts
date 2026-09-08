import type { UserRole } from "@/features/auth/types/role";

/**
 * Maps a signed-in user's role to the page they should land on after
 * authenticating. No role-specific workspace views exist yet, so every role
 * currently resolves to the same landing page — this function is the seam
 * to extend once they do, instead of hardcoding a redirect target at every
 * call site.
 */
export function getRoleDestination(role: UserRole): string {
  switch (role) {
    case "event_organiser":
    case "event_coordinator":
    case "venue_staff":
    case "technical_support_staff":
    case "attendee":
    case "administrator":
      return "/home";
  }
}
