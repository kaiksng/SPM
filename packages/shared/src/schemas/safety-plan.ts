import { z } from "zod";

/** Mirrors the limits in set_event_venue_safety_checks / set_event_equipment_placement (202610310007). */
export const SAFETY_PLAN_MAX_LENGTH = 2_000;

const details = (label: string) =>
  z.string().trim().max(SAFETY_PLAN_MAX_LENGTH, `${label} must contain at most 2,000 characters`);

/**
 * SPM-90: the Venue step's safety checks. Each is ticked once the
 * coordinator has checked it; details are optional. event_readiness
 * requires all three ticks before the safety check.
 */
export const venueSafetyChecksSchema = z.object({
  emergencyAccessChecked: z.boolean(),
  emergencyAccess: details("Emergency access"),
  restrictionsChecked: z.boolean(),
  restrictions: details("Known restrictions"),
  crowdMovementChecked: z.boolean(),
  crowdMovementPlan: details("Crowd movement plan"),
});

export type VenueSafetyChecksValues = z.infer<typeof venueSafetyChecksSchema>;

/**
 * SPM-90: the Equipment step's safety check, as open text. Required before
 * the safety check when the event has equipment; may be saved blank while
 * planning.
 */
export const equipmentPlacementSchema = z.object({
  equipmentPlacement: details("Equipment placement"),
});

export type EquipmentPlacementValues = z.infer<typeof equipmentPlacementSchema>;
