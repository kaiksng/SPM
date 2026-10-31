import {
  equipmentPlacementSchema,
  venueSafetyChecksSchema,
  type EquipmentPlacementValues,
  type VenueSafetyChecksValues,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

function saveError(error: { code?: string; message: string }) {
  return new Error(
    error.code === "23514" || error.code === "42501"
      ? error.message
      : "The safety checks could not be saved. Your changes are still here.",
  );
}

/**
 * SPM-90: the Venue step's safety checks — emergency access, known
 * restrictions and crowd movement, each ticked with optional details.
 * public.set_event_venue_safety_checks allows only the assigned coordinator,
 * only in Planning.
 */
export async function saveVenueSafetyChecks(
  eventId: string,
  values: VenueSafetyChecksValues,
): Promise<VenueSafetyChecksValues> {
  const parsed = venueSafetyChecksSchema.parse(values);
  const { error } = await supabase.rpc("set_event_venue_safety_checks", {
    p_event_id: eventId,
    p_emergency_access_checked: parsed.emergencyAccessChecked,
    p_emergency_access: parsed.emergencyAccess,
    p_restrictions_checked: parsed.restrictionsChecked,
    p_restrictions: parsed.restrictions,
    p_crowd_movement_checked: parsed.crowdMovementChecked,
    p_crowd_movement_plan: parsed.crowdMovementPlan,
  });
  if (error) throw saveError(error);
  return parsed;
}

/** SPM-90: the Equipment step's safety check — where the equipment goes. */
export async function saveEquipmentPlacement(
  eventId: string,
  values: EquipmentPlacementValues,
): Promise<EquipmentPlacementValues> {
  const parsed = equipmentPlacementSchema.parse(values);
  const { error } = await supabase.rpc("set_event_equipment_placement", {
    p_event_id: eventId,
    p_equipment_placement: parsed.equipmentPlacement,
  });
  if (error) throw saveError(error);
  return parsed;
}
