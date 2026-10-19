import {
  SafetyCheckSubmissionError,
  safetyCheckOutstandingItemsSchema,
  type EventReadiness,
  type ReadinessStatus,
} from "@spm/shared";

import { ApiError, apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

/**
 * Read-only: public.event_readiness computes everything from records under
 * RLS (AC04), so this reads straight through Supabase rather than the
 * backend, same as checkVenueBookingAvailability.
 */
export async function loadEventReadiness(eventId: string): Promise<EventReadiness> {
  const { data, error } = await supabase.rpc("event_readiness", { p_event_id: eventId });

  if (error || !data) {
    throw new Error("This event's readiness could not be checked.");
  }

  return data as unknown as EventReadiness;
}

/**
 * AC05/AC06. Goes through apps/backend's service client, not a direct
 * supabase-js call: submit_event_for_safety_check inserts a `notifications`
 * row for every safety-officer profile, which has no INSERT policy for
 * regular users — same reasoning as submitEventRequest.
 */
export async function submitEventForSafetyCheck(eventId: string): Promise<{ round: number }> {
  try {
    const { data } = await apiFetch(`/events/${eventId}/submit-safety-check`, { method: "POST" });
    return data as { round: number };
  } catch (error) {
    if (error instanceof ApiError && error.fields) {
      const items = safetyCheckOutstandingItemsSchema.safeParse(error.fields);
      throw new SafetyCheckSubmissionError(error.message, items.success ? items.data : undefined);
    }

    throw new SafetyCheckSubmissionError(
      error instanceof Error ? error.message : "This event could not be submitted for the safety check.",
    );
  }
}

export type SafetyCheckSubmission = {
  round: number;
  submittedAt: string;
};

/**
 * The event's most recent submission, if any — for the read-only "Round N
 * submitted" banner once the event is Pending Safety Check. RLS's "safety
 * check submissions visible to the event's people" policy already covers the
 * organiser, assigned coordinator and lead, so this reads straight through
 * Supabase.
 */
export async function loadLatestSafetyCheckSubmission(
  eventId: string,
): Promise<SafetyCheckSubmission | null> {
  const { data, error } = await supabase
    .from("event_safety_check_submissions")
    .select("round, submitted_at")
    .eq("event_id", eventId)
    .order("round", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("This event's safety check submission is unavailable.");
  if (!data) return null;

  return { round: data.round, submittedAt: data.submitted_at };
}

export const READINESS_ITEM_BADGE_CLASSES: Record<ReadinessStatus | "not_required", string> = {
  complete: "bg-emerald-100 text-emerald-800",
  pending: "bg-slate-200 text-slate-600",
  needs_review: "bg-orange-200 text-orange-900",
  not_required: "bg-slate-100 text-slate-500",
};
