import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

export type EventDecisionSummary = {
  id: string;
  decision: "approved" | "rejected";
  rationale: string | null;
  decidedAt: string;
  decidedByName: string | null;
};

/**
 * Read-only, oldest first. RLS ("decisions visible to event participants")
 * scopes this the same way can_view_event does elsewhere — no separate
 * write-side concern here, this only reads what decide_event_request wrote.
 */
export async function listEventDecisions(eventId: string): Promise<EventDecisionSummary[]> {
  const { data, error } = await supabase
    .from("event_decisions")
    .select(
      "id, decision, rationale, decided_at, decided_by:profiles!event_decisions_decided_by_fkey (full_name)",
    )
    .eq("event_id", eventId)
    .order("decided_at", { ascending: true });

  if (error) throw new Error("This event's decision history is unavailable.");

  return (data ?? []).map((row) => ({
    id: row.id,
    decision: row.decision,
    rationale: row.rationale,
    decidedAt: row.decided_at,
    decidedByName: row.decided_by?.full_name ?? null,
  }));
}

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
