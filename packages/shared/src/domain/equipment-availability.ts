/**
 * SPM-31 results, as public.check_event_equipment_availability returns them
 * (202610061001). Keep the two in step.
 */
export const equipmentAvailabilityStatuses = [
  "available",
  "partially_available",
  "unavailable",
  "unknown",
] as const;

export type EquipmentAvailabilityStatus = (typeof equipmentAvailabilityStatuses)[number];

export const equipmentAvailabilityStatusLabels: Readonly<Record<EquipmentAvailabilityStatus, string>> = {
  available: "Available",
  partially_available: "Partially available",
  unavailable: "Unavailable",
  unknown: "Unknown equipment",
};

export function isEquipmentAvailabilityStatus(value: string): value is EquipmentAvailabilityStatus {
  return (equipmentAvailabilityStatuses as readonly string[]).includes(value);
}

/** How many more are needed than can be provided (the scenario's "shortage"). */
export function equipmentShortage(result: {
  status: EquipmentAvailabilityStatus;
  requestedQuantity: number;
  availableQuantity: number;
}) {
  if (result.status === "unknown") return null;
  return Math.max(result.requestedQuantity - result.availableQuantity, 0);
}

/** The event's overall position: the worst status among its items. */
export function overallEquipmentAvailability(
  statuses: readonly EquipmentAvailabilityStatus[],
): EquipmentAvailabilityStatus | null {
  if (statuses.length === 0) return null;
  for (const status of ["unknown", "unavailable", "partially_available"] as const) {
    if (statuses.includes(status)) return status;
  }
  return "available";
}
