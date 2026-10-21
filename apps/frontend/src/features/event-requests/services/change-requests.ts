import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

export type EventChangeRequestStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type EventChangeRequestSummary = {
  id: string;
  requestedChanges: Record<string, unknown>;
  reason: string;
  status: EventChangeRequestStatus;
  reviewNotes: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  withdrawnAt: string | null;
};

/** Read-only history for a single event, oldest round first (AC06). RLS-covered. */
export async function listEventChangeRequests(
  eventId: string,
): Promise<EventChangeRequestSummary[]> {
  const { data, error } = await supabase
    .from("event_change_requests")
    .select(
      "id, requested_changes, reason, status, review_notes, requested_at, reviewed_at, withdrawn_at",
    )
    .eq("event_id", eventId)
    .order("requested_at", { ascending: true });

  if (error) throw new Error("We couldn't load the change request history.");

  return data.map(
    (row): EventChangeRequestSummary => ({
      id: row.id,
      requestedChanges: row.requested_changes as Record<string, unknown>,
      reason: row.reason,
      status: row.status as EventChangeRequestStatus,
      reviewNotes: row.review_notes,
      requestedAt: row.requested_at,
      reviewedAt: row.reviewed_at,
      withdrawnAt: row.withdrawn_at,
    }),
  );
}

/**
 * A cheap lookup for an event card's badge — just whether a change request
 * is currently awaiting review, not the full history listEventChangeRequests
 * loads. Mirrors getClarificationReviewState's role: the visible stand-in for
 * a notification, since the event's own status doesn't change while a
 * change request is pending. Fails closed to "no badge" rather than blocking
 * the card.
 */
export async function hasPendingChangeRequest(eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("event_change_requests")
    .select("id")
    .eq("event_id", eventId)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (error) return false;
  return data !== null;
}

/**
 * These three mutations insert a `notifications` row, which has no INSERT
 * policy for regular users, so they go through apps/backend's service
 * client — same reasoning as clarifications.ts's write endpoints.
 */
export async function submitEventChangeRequest(
  eventId: string,
  requestedChanges: Record<string, unknown>,
  reason: string,
) {
  return apiFetch(`/events/${eventId}/change-requests`, {
    method: "POST",
    body: JSON.stringify({ requestedChanges, reason }),
  });
}

export async function decideEventChangeRequest(
  changeRequestId: string,
  decision: "approved" | "rejected",
  reviewNotes?: string,
) {
  return apiFetch(`/change-requests/${changeRequestId}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, reviewNotes }),
  });
}

export async function withdrawEventChangeRequest(changeRequestId: string) {
  return apiFetch(`/change-requests/${changeRequestId}/withdraw`, {
    method: "POST",
  });
}
