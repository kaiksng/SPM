import { supabase } from "@/lib/supabase-client";

export type EventStatusChange = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  /** null when no person made the change (a system action, SPM-12 AC03). */
  changedById: string | null;
  changedByName: string | null;
  changedAt: string;
};

/**
 * The event's full lifecycle timeline — every status change since creation,
 * oldest first, each with its previous status, new status, actor, and
 * timestamp. Reads event_status_history directly: RLS's "history visible to
 * event participants" policy (can_view_event, unchanged since the initial
 * schema) already scopes this to whoever can see the event at all — no new
 * table or policy needed, this is the first UI surface for a table that has
 * been populated since day one.
 */
export async function listEventStatusHistory(eventId: string): Promise<EventStatusChange[]> {
  const { data, error } = await supabase
    .from("event_status_history")
    .select(
      "id, from_status, to_status, changed_at, changed_by_id:changed_by, changed_by:profiles!event_status_history_changed_by_fkey (full_name)",
    )
    .eq("event_id", eventId)
    .order("changed_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw new Error("This event's status history is unavailable.");

  return (data ?? []).map((row) => ({
    id: row.id,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    changedById: row.changed_by_id,
    changedByName: row.changed_by?.full_name ?? null,
    changedAt: row.changed_at,
  }));
}

/**
 * Marks a Confirmed event Completed. Assigned-coordinator-only, enforced by
 * complete_event itself (security definer, its own checks) — this is a
 * thin wrapper, the same shape as save_event_draft's direct RPC call.
 */
export async function completeEvent(eventId: string) {
  const { data, error } = await supabase.rpc("complete_event", { p_event_id: eventId });

  if (error || !data) {
    // SPM-46: check_violation messages are written for the coordinator, e.g.
    // the earliest time the event can be completed or an open venue request
    // to resolve first.
    throw new Error(
      error?.code === "23514" ? error.message : "This event could not be marked completed.",
    );
  }

  return data;
}

/**
 * SPM-46 AC02: the earliest time the event can be marked completed — its
 * end time plus venue turnaround (event_completion_available_at, the same
 * rule complete_event enforces).
 */
export async function loadEventCompletionAvailableAt(eventId: string): Promise<string> {
  const { data, error } = await supabase.rpc("event_completion_available_at", {
    p_event_id: eventId,
  });

  if (error || !data) {
    throw new Error("When this event can be marked completed is unavailable.");
  }

  return data;
}
