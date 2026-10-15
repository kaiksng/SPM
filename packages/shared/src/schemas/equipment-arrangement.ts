import { z } from "zod";

import { equipmentArrangementStatuses } from "../domain/equipment-arrangement";

/**
 * SPM-28 form. Mirrors public.update_equipment_arrangement, which is
 * authoritative. The note is optional for every status.
 */
export const equipmentArrangementSchema = z.object({
  status: z.enum(equipmentArrangementStatuses, "Choose an arrangement status"),
  note: z.string().trim().max(1000, "Note must contain at most 1000 characters"),
});

export type EquipmentArrangementFormValues = z.infer<typeof equipmentArrangementSchema>;
