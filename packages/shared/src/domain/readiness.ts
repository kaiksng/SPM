/**
 * Event readiness for the Operational Safety Check. Mirrors
 * public.event_readiness (202610190001) — the RPC's jsonb is the source of
 * truth; these pure functions exist for typing and so the exact mapping is
 * documented and tested in one place, same relationship as event-status.ts
 * has with event_status_transition_allowed. Keep the two in step.
 */
import type { EquipmentArrangementStatus } from "./equipment-arrangement";

export type ReadinessStatus = "complete" | "pending" | "needs_review";
export type EquipmentArrangementOverallStatus = ReadinessStatus | "not_required";

export const READINESS_STATUS_LABELS: Record<EquipmentArrangementOverallStatus, string> = {
  complete: "Complete",
  pending: "Pending",
  needs_review: "Needs Review",
  not_required: "Not Required",
};

export type VenueBookingReadiness = {
  bookingId: string;
  venueName: string;
  isMainVenue: boolean;
  status: ReadinessStatus;
  /** Set only when status is "needs_review" — why it was flagged. */
  needsReviewReason: string | null;
  /**
   * Whether "Mark resolved" applies: a change-request or safety-check flag.
   * A conflict or disruption clears once the booking itself is fixed
   * (202611010010). Absent on readiness snapshots taken before then.
   */
  canMarkResolved?: boolean;
};

export type EquipmentRequirementReadiness = {
  requirementId: string;
  equipmentName: string;
  quantity: number;
  status: ReadinessStatus;
  /** Set only when status is "needs_review" — why it was flagged. */
  needsReviewReason: string | null;
};

export type ReadinessOutstandingItem = {
  code: string;
  message: string;
};

export type EventReadiness = {
  ready: boolean;
  venues: VenueBookingReadiness[];
  venueArrangementStatus: ReadinessStatus;
  equipment: EquipmentRequirementReadiness[];
  equipmentArrangementStatus: EquipmentArrangementOverallStatus;
  outstandingItems: ReadinessOutstandingItem[];
};

/**
 * AC02/AC07: only an Approved, unflagged, undisrupted booking is Complete.
 * A Pending request is Pending. An active (tentative) hold is Needs Review
 * (AC02 names a hold explicitly), never Complete. A flagged, disrupted, or
 * conflicted Approved booking is also Needs Review. `hasConflict` means a
 * conflict this booking must move for: of two overlapping bookings only the
 * later-requested one, or one overlapping a venue block (202611010010).
 */
export function deriveVenueBookingReadinessStatus(input: {
  status: "pending" | "approved" | "on_hold";
  needsReview: boolean;
  disrupted: boolean;
  hasConflict: boolean;
}): ReadinessStatus {
  if (input.status === "on_hold") return "needs_review";
  if (input.status !== "approved") return "pending";
  return input.needsReview || input.disrupted || input.hasConflict ? "needs_review" : "complete";
}

/**
 * AC03/AC07: Needs Review if any active booking is; else Pending unless
 * there is exactly one Complete main venue and every other active booking
 * is also Complete. Callers pass only "active" bookings (pending, approved
 * or on_hold) — a cancelled or rejected one is not part of this rollup.
 */
export function deriveVenueArrangementOverallStatus(
  bookings: readonly { isMainVenue: boolean; status: ReadinessStatus }[],
): ReadinessStatus {
  if (bookings.some((booking) => booking.status === "needs_review")) return "needs_review";
  const mainBookings = bookings.filter((booking) => booking.isMainVenue);
  const mainComplete = mainBookings.length > 0 && mainBookings.every((booking) => booking.status === "complete");
  if (!mainComplete) return "pending";
  return bookings.every((booking) => booking.status === "complete") ? "complete" : "pending";
}

/**
 * AC01: Arranged -> Complete, Issue -> Needs Review, everything else -> Pending.
 * `arrangementStatus` is what event_readiness worked out from the
 * reservation, the same way automaticEquipmentArrangementStatus does, so a
 * requirement reserved in full always resolves here as Complete.
 */
export function deriveEquipmentRequirementReadinessStatus(
  arrangementStatus: EquipmentArrangementStatus,
): ReadinessStatus {
  if (arrangementStatus === "issue") return "needs_review";
  if (arrangementStatus === "arranged") return "complete";
  return "pending";
}

/**
 * AC01/AC03: Not Required only when the event has no equipment requirements
 * at all (and the organiser already acknowledged none were needed, which is
 * always true by the time an event reaches Planning). Otherwise Needs
 * Review if anything is flagged Issue, Complete only once every requirement
 * is reserved in full, else Pending.
 */
export function deriveEquipmentArrangementOverallStatus(input: {
  requirementCount: number;
  requirementsAcknowledged: boolean;
  anyIssue: boolean;
  allReservedInFull: boolean;
}): EquipmentArrangementOverallStatus {
  if (input.requirementCount === 0) {
    return input.requirementsAcknowledged ? "not_required" : "pending";
  }
  if (input.anyIssue) return "needs_review";
  return input.allReservedInFull ? "complete" : "pending";
}

/**
 * AC04: always derived, never a stored flag. Configure Event Registration
 * AC07: registration the event requires must also be complete and within
 * the main venue's capacity (omitted = nothing outstanding).
 */
export function isEventReady(input: {
  venueArrangementStatus: ReadinessStatus;
  equipmentArrangementStatus: EquipmentArrangementOverallStatus;
  registrationReady?: boolean;
}): boolean {
  return (
    input.venueArrangementStatus === "complete" &&
    (input.equipmentArrangementStatus === "complete" || input.equipmentArrangementStatus === "not_required") &&
    input.registrationReady !== false
  );
}
