/**
 * What the Safety Officer reviews for an event. Mirrors the jsonb returned
 * by public.safety_check_review_details (last 202610310007); the RPC is the
 * source of truth, these types document its shape for both apps.
 */
export type SafetyReviewVenue = {
  bookingId: string;
  venueName: string;
  location: string;
  label: string;
  isMainVenue: boolean;
  capacity: number;
  /** This booking's own headcount, falling back to the event's expected attendance. */
  headcount: number | null;
  /** True when headcount is known and exceeds the venue's capacity. */
  underCapacity: boolean;
  layouts: string[];
  requestedLayoutNotes: string | null;
  requestedAccessibilityNotes: string | null;
  venueAccessibilityNotes: string | null;
  venueDescription: string | null;
};

export type SafetyReviewEquipment = {
  requirementId: string;
  equipmentName: string;
  quantity: number;
  /** The item's technical requirements. Placement is the event's equipmentPlacement. */
  notes: string | null;
};

export type SafetyReviewDetails = {
  expectedAttendance: number | null;
  accessibilityNeeds: string | null;
  layoutPreference: string | null;
  venues: SafetyReviewVenue[];
  equipment: SafetyReviewEquipment[];
  /** The coordinator's safety plan (SPM-90). */
  crowdMovementPlan: string | null;
  equipmentPlacement: string | null;
  /** Exits, evacuation route, assembly point. */
  emergencyAccess: string | null;
  /** Known venue restrictions, e.g. no open flames. */
  restrictions: string | null;
  /** Whether the coordinator ticked each Venue step check (details are optional). */
  emergencyAccessChecked: boolean;
  restrictionsChecked: boolean;
  crowdMovementChecked: boolean;
};

/**
 * SPM-90: the coordinator's safety checks a Safety Officer can flag when
 * requesting changes (decide_event_safety_check, 202610310008).
 */
export const SAFETY_CHECK_FLAGS = ["emergency_access", "restrictions", "crowd_movement", "equipment_placement"] as const;

export type SafetyCheckFlag = (typeof SAFETY_CHECK_FLAGS)[number];

export const SAFETY_CHECK_FLAG_LABELS: Readonly<Record<SafetyCheckFlag, string>> = {
  emergency_access: "Emergency access",
  restrictions: "Known restrictions",
  crowd_movement: "Crowd movement",
  equipment_placement: "Equipment placement",
};

export function isSafetyCheckFlag(value: string): value is SafetyCheckFlag {
  return (SAFETY_CHECK_FLAGS as readonly string[]).includes(value);
}
