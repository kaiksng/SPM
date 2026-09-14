import { apiFetch } from "@/lib/api-client";

/**
 * Inserts a `notifications` row for the organiser, which has no INSERT
 * policy for regular users, so this goes through apps/backend's service
 * client — same reasoning as clarifications.ts's write endpoints.
 */
export async function decideEvent(
  eventId: string,
  decision: "approved" | "rejected",
  rationale: string,
) {
  return apiFetch(`/events/${eventId}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, rationale }),
  });
}
