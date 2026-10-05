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
 * Read-only history of a now-retired feature: coordinators used to be able
 * to hand their own event off to another coordinator (least-loaded rule).
 * Reassignment is now Event Coordinator Lead-only (see
 * listEventCoordinatorAssignmentHistory below) — this stays only to show
 * whatever history already exists from when that feature was live.
 * audit_logs itself has no SELECT policy, so this goes through
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

export type EventCoordinatorAssignmentRecord = {
  id: number;
  previousCoordinatorId: string | null;
  previousCoordinatorName: string | null;
  newCoordinatorId: string;
  newCoordinatorName: string | null;
  changedById: string | null;
  changedByName: string | null;
  reason: string | null;
  changedAt: string;
  endedAt: string | null;
};

/**
 * Read-only history of the Event Coordinator Lead's assign/reassign
 * decisions for this event — a separate table and feature from
 * listEventCoordinatorReassignments's self-service coordinator hand-off
 * above. `endedAt` is null for whichever row is the event's current
 * assignment, so a viewer can see each coordinator's actual tenure.
 */
export async function listEventCoordinatorAssignmentHistory(
  eventId: string,
): Promise<EventCoordinatorAssignmentRecord[]> {
  const { data, error } = await supabase.rpc("list_event_coordinator_history", {
    p_event_id: eventId,
  });

  if (error) throw new Error("This event's assignment history is unavailable.");

  return (data ?? []).map((row) => ({
    id: row.id,
    previousCoordinatorId: row.previous_coordinator_id,
    previousCoordinatorName: row.previous_coordinator_name,
    newCoordinatorId: row.new_coordinator_id,
    newCoordinatorName: row.new_coordinator_name,
    changedById: row.changed_by_id,
    changedByName: row.changed_by_name,
    reason: row.reason,
    changedAt: row.changed_at,
    endedAt: row.ended_at,
  }));
}
