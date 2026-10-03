import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

export type EventCoordinatorReassignment = {
  id: number;
  previousCoordinatorId: string | null;
  previousCoordinatorName: string | null;
  newCoordinatorId: string;
  newCoordinatorName: string | null;
  reason: string | null;
  changedAt: string;
};

/**
 * Hands an event off from the currently assigned coordinator to another
 * coordinator, chosen by the same least-loaded rule as initial assignment.
 * Inserts an `audit_logs` row and a `notifications` row, neither of which
 * has an INSERT policy for regular users, so this goes through apps/backend's
 * service client — same reasoning as decisions.ts and clarifications.ts.
 */
export async function reassignEventCoordinator(eventId: string, reason: string) {
  return apiFetch(`/events/${eventId}/auto-reassign-coordinator`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

/**
 * Read-only history of auto_reassign_event_coordinator calls for this event,
 * oldest first. audit_logs itself has no SELECT policy, so this goes through
 * list_auto_event_coordinator_reassignments (security definer, granted to
 * authenticated, gated on can_view_event) rather than a direct table read.
 */
export async function listEventCoordinatorReassignments(
  eventId: string,
): Promise<EventCoordinatorReassignment[]> {
  const { data, error } = await supabase.rpc("list_auto_event_coordinator_reassignments", {
    p_event_id: eventId,
  });

  if (error) throw new Error("This event's reassignment history is unavailable.");

  return (data ?? []).map((row) => ({
    id: row.id,
    previousCoordinatorId: row.previous_coordinator_id,
    previousCoordinatorName: row.previous_coordinator_name,
    newCoordinatorId: row.new_coordinator_id,
    newCoordinatorName: row.new_coordinator_name,
    reason: row.reason,
    changedAt: row.changed_at,
  }));
}
