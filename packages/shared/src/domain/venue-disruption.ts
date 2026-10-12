/**
 * What a coordinator sees for a venue booking disrupted by a venue block
 * (SPM-83): Replacement Required until a replacement is requested (SPM-82),
 * Replacement Requested while that request is pending, and Resolved once the
 * disruption is cleared or the disrupted booking is no longer active (for
 * example cancelled when its replacement is approved).
 */
export type VenueDisruptionState =
  | "replacement_required"
  | "replacement_requested"
  | "resolved";

export const VENUE_DISRUPTION_STATE_LABELS: Record<VenueDisruptionState, string> = {
  replacement_required: "Replacement Required",
  replacement_requested: "Replacement Requested",
  resolved: "Resolved",
};

export function deriveVenueDisruptionState(input: {
  clearedAt: string | null;
  bookingActive: boolean;
  replacementRequested?: boolean;
}): VenueDisruptionState {
  if (input.clearedAt !== null || !input.bookingActive) return "resolved";
  return input.replacementRequested ? "replacement_requested" : "replacement_required";
}
