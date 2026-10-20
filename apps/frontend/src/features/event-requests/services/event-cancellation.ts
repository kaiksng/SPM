import { apiFetch } from "@/lib/api-client";

/**
 * Inserts `notifications` rows (organiser, coordinator, attendees, and role
 * broadcasts), which regular users have no INSERT policy for, so this goes
 * through apps/backend's service client — same reasoning as decisions.ts.
 */
export async function cancelEvent(eventId: string, reason: string) {
  return apiFetch(`/events/${eventId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
