import { equipmentUnavailabilityStatus } from "@spm/shared";

import type { EquipmentUnavailabilityRecord } from "@/features/equipment/services/equipment-unavailability";

/**
 * What is out of service right now: units named on an in-progress record
 * (with that record, for its reason), and the total quantity out per item
 * (including records that give only a quantity).
 */
export function currentOutages(records: EquipmentUnavailabilityRecord[], now = new Date()) {
  const recordByUnit = new Map<string, EquipmentUnavailabilityRecord>();
  const quantityByItem = new Map<string, number>();

  for (const record of records) {
    if (equipmentUnavailabilityStatus(record, now) !== "in_progress") continue;
    quantityByItem.set(
      record.equipmentItemId,
      (quantityByItem.get(record.equipmentItemId) ?? 0) + record.quantity,
    );
    for (const unitId of record.unitIds) recordByUnit.set(unitId, record);
  }

  return { recordByUnit, quantityByItem };
}
