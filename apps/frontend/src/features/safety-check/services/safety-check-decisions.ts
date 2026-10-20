import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

function operationError(message: string) {
  return new Error(message);
}

export type PendingSafetyCheckEvent = {
  eventId: string;
  title: string;
  organiserName: string | null;
  coordinatorName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  expectedAttendance: number | null;
  round: number | null;
};

/**
 * Every event currently Pending Safety Check — the Safety Officer's queue.
 * RLS's can_view_event grants a safety_officer read access to exactly these
 * events (202610200005), so this reads straight through Supabase, same
 * pattern as loadEventReadiness. The latest round per event is fetched
 * separately and merged client-side rather than via a nested embed, since
 * PostgREST can't limit an embedded relation per parent row.
 */
export async function listPendingSafetyCheckEvents(): Promise<PendingSafetyCheckEvent[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select(
      `
        id, title, starts_at, ends_at, expected_attendance,
        organiser:profiles!events_organiser_id_fkey (full_name),
        coordinator:profiles!events_assigned_coordinator_id_fkey (full_name)
      `,
    )
    .eq("status", "pending_safety_check")
    .order("starts_at", { ascending: true });

  if (error) throw operationError("The safety check queue is unavailable.");
  if (!events || events.length === 0) return [];

  const { data: submissions } = await supabase
    .from("event_safety_check_submissions")
    .select("event_id, round")
    .in(
      "event_id",
      events.map((event) => event.id),
    )
    .order("round", { ascending: false });

  const latestRoundByEvent = new Map<string, number>();
  for (const submission of submissions ?? []) {
    if (!latestRoundByEvent.has(submission.event_id)) {
      latestRoundByEvent.set(submission.event_id, submission.round);
    }
  }

  return events.map((event) => ({
    eventId: event.id,
    title: event.title,
    organiserName: event.organiser?.full_name ?? null,
    coordinatorName: event.coordinator?.full_name ?? null,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    expectedAttendance: event.expected_attendance,
    round: latestRoundByEvent.get(event.id) ?? null,
  }));
}

export type SafetyCheckDecisionOutcome = "changes_requested" | "rejected";

export type SafetyCheckDecisionResult = {
  eventId: string;
  status: string;
  outcome: SafetyCheckDecisionOutcome;
  flaggedBookingCount: number;
  flaggedRequirementCount: number;
};

/**
 * AC1/AC4/AC7. Goes through apps/backend's service client, not a direct
 * supabase-js call: decide_event_safety_check inserts `notifications` rows,
 * which have no INSERT policy for regular users — same reasoning as
 * submitEventForSafetyCheck.
 */
export async function decideEventSafetyCheck(
  eventId: string,
  decision: SafetyCheckDecisionOutcome,
  reason: string,
  flaggedBookingIds: string[] = [],
  flaggedRequirementIds: string[] = [],
): Promise<SafetyCheckDecisionResult> {
  const { data } = await apiFetch(`/events/${eventId}/safety-check-decision`, {
    method: "POST",
    body: JSON.stringify({
      decision,
      reason,
      flaggedBookingIds,
      flaggedRequirementIds,
    }),
  });

  return data as SafetyCheckDecisionResult;
}

export type SafetyCheckDecisionHistoryEntry = {
  id: number;
  round: number;
  outcome: "approved" | SafetyCheckDecisionOutcome;
  reason: string;
  decidedByName: string | null;
  decidedAt: string;
  flaggedBookingIds: string[];
  flaggedRequirementIds: string[];
};

/**
 * AC6: every review round, for the event's history page. RLS already scopes
 * this to the event's organiser/assigned coordinator/coordinator lead/any
 * safety officer (202610200003).
 */
export async function listSafetyCheckDecisions(
  eventId: string,
): Promise<SafetyCheckDecisionHistoryEntry[]> {
  const { data, error } = await supabase
    .from("event_safety_check_decisions")
    .select(
      `
        id, outcome, reason, decided_at, flagged_booking_ids, flagged_requirement_ids,
        decided_by_profile:profiles!event_safety_check_decisions_decided_by_fkey (full_name),
        submission:event_safety_check_submissions!event_safety_check_decisions_submission_id_fkey (round)
      `,
    )
    .eq("event_id", eventId)
    .order("decided_at", { ascending: false });

  if (error) throw operationError("This event's safety check history is unavailable.");

  return (data ?? []).map((row) => ({
    id: row.id,
    round: row.submission?.round ?? 0,
    outcome: row.outcome,
    reason: row.reason,
    decidedByName: row.decided_by_profile?.full_name ?? null,
    decidedAt: row.decided_at,
    flaggedBookingIds: row.flagged_booking_ids,
    flaggedRequirementIds: row.flagged_requirement_ids,
  }));
}
