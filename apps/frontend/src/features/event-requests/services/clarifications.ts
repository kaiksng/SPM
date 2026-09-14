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
