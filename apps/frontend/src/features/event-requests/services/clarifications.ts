import type { ClarificationPermittedField, ClarificationStatus } from "@spm/shared";

import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

export type ClarificationSummary = {
  id: string;
  question: string;
  response: string | null;
  status: ClarificationStatus;
  permittedFields: string[];
  requestedAt: string;
  respondedAt: string | null;
  resolvedAt: string | null;
};

/** Read-only history for a single event, oldest round first (AC07). RLS-covered. */
export async function listClarifications(eventId: string) {
  const { data, error } = await supabase
    .from("clarifications")
    .select(
      "id, question, response, status, permitted_fields, requested_at, responded_at, resolved_at",
    )
    .eq("event_id", eventId)
    .order("requested_at", { ascending: true });

  if (error) throw new Error("We couldn't load the clarification history.");

  return data.map(
    (row): ClarificationSummary => ({
      id: row.id,
      question: row.question,
      response: row.response,
      status: row.status,
      permittedFields: row.permitted_fields,
      requestedAt: row.requested_at,
      respondedAt: row.responded_at,
      resolvedAt: row.resolved_at,
    }),
  );
}

/**
 * A cheap lookup for the list-card badge, which only needs the one
 * unresolved round's status — not the full history listClarifications loads
 * for the detail page's panel. Fails closed to "no badge" rather than
 * blocking the card. Distinguishing open/answered is what lets the badge
 * change (Clarification Required → Response Received) once the organiser
 * responds — the visible stand-in for a notification.
 */
export async function getClarificationReviewState(
  eventId: string,
): Promise<"open" | "answered" | undefined> {
  const { data, error } = await supabase
    .from("clarifications")
    .select("status")
    .eq("event_id", eventId)
    .in("status", ["open", "answered"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return undefined;
  return data.status as "open" | "answered";
}

/**
 * These three mutations insert a `notifications` row, which has no INSERT
 * policy for regular users, so they go through apps/backend's service client
 * — same reason event-submissions.ts calls submit through the backend
 * instead of supabase-js directly.
 */
export async function requestClarification(
  eventId: string,
  question: string,
  permittedFields: ClarificationPermittedField[],
) {
  return apiFetch(`/events/${eventId}/clarifications`, {
    method: "POST",
    body: JSON.stringify({ question, permittedFields }),
  });
}

export async function respondToClarification(
  clarificationId: string,
  response: string,
) {
  return apiFetch(`/clarifications/${clarificationId}/respond`, {
    method: "POST",
    body: JSON.stringify({ response }),
  });
}

export async function resolveClarification(clarificationId: string) {
  return apiFetch(`/clarifications/${clarificationId}/resolve`, {
    method: "POST",
  });
}
