import { z } from "zod";

import { supabase } from "@/lib/supabase-client";

const venueSnapshot = z.object({
  bookingId: z.string(), venueName: z.string(), isMainVenue: z.boolean().optional(),
});
const equipmentSnapshot = z.object({
  requirementId: z.string(), equipmentName: z.string(), quantity: z.number(),
});
const historyRecordSchema = z.object({
  decisionId: z.number().int().positive(), eventId: z.string(), title: z.string(),
  currentStatus: z.string(), currentRound: z.number().int(), round: z.number().int(),
  submittedAt: z.string(), coordinatorName: z.string().nullable(),
  outcome: z.enum(["approved", "changes_requested", "rejected"]),
  reason: z.string().nullable(), reviewerName: z.string().nullable(), decidedAt: z.string(),
  flaggedBookingIds: z.array(z.string()), flaggedRequirementIds: z.array(z.string()),
  // SPM-90 (202610310008): the coordinator's safety checks flagged in this round.
  flaggedSafetyChecks: z.array(z.string()).default([]),
  venuesSnapshot: z.array(venueSnapshot), equipmentSnapshot: z.array(equipmentSnapshot),
  periodSnapshot: z.object({ startsAt: z.string().nullable(), endsAt: z.string().nullable() }),
  attendanceSnapshot: z.number().nullable(),
});
export type SafetyReviewHistoryRecord = z.infer<typeof historyRecordSchema>;
export const SAFETY_REVIEW_OUTCOME_LABELS = {
  approved: "Approved", changes_requested: "Changes requested", rejected: "Rejected",
} as const;
export const SAFETY_REVIEW_OUTCOME_CLASSES = {
  approved: "bg-emerald-100 text-emerald-800",
  changes_requested: "bg-yellow-100 text-yellow-900",
  rejected: "bg-red-100 text-red-800",
} as const;

async function loadPage(offset: number, decisionId?: number) {
  const { data, error } = await supabase.rpc("safety_check_review_history", {
    p_offset: offset, p_limit: 100, ...(decisionId === undefined ? {} : { p_decision_id: decisionId }),
  });
  if (error) throw new Error("Safety review history is unavailable. Please try again.");
  const parsed = z.array(historyRecordSchema).safeParse(data);
  if (!parsed.success) throw new Error("The safety review history response could not be read.");
  return parsed.data;
}

/** Separate read-only RPC: no access to unrelated event records is granted. */
export async function listSafetyReviewHistory(): Promise<SafetyReviewHistoryRecord[]> {
  const records: SafetyReviewHistoryRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const page = await loadPage(offset);
    records.push(...page);
    if (page.length < 100) return records;
  }
}
export async function loadSafetyReviewHistoryRecord(decisionId: number): Promise<SafetyReviewHistoryRecord | null> {
  if (!Number.isSafeInteger(decisionId) || decisionId < 1) throw new Error("This review record link is invalid.");
  const records = await loadPage(0, decisionId);
  return records[0] ?? null;
}
