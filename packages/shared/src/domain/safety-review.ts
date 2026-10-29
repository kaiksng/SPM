/**
 * What the Safety Officer reviews for an event. Mirrors the jsonb returned
 * by public.safety_check_review_details (202610280002); the RPC is the
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
  /** The only venue text that can carry emergency access or restrictions. */
  venueDescription: string | null;
};

export type SafetyReviewEquipment = {
  requirementId: string;
  equipmentName: string;
  quantity: number;
  /** Free text; where the organiser or coordinator records placement. */
  notes: string | null;
};

export type SafetyReviewDetails = {
  expectedAttendance: number | null;
  accessibilityNeeds: string | null;
  layoutPreference: string | null;
  venues: SafetyReviewVenue[];
  equipment: SafetyReviewEquipment[];
};
