/**
 * Reservation history, as public.equipment_reservation_events records it
 * (202610061002). Keep the two in step.
 */
export const equipmentReservationActions = [
  "reserved",
  "changed",
  "rechecked",
  "released",
  "flagged_for_recheck",
] as const;

export type EquipmentReservationAction = (typeof equipmentReservationActions)[number];

export const equipmentReservationActionLabels: Readonly<Record<EquipmentReservationAction, string>> = {
  reserved: "Reserved",
  changed: "Changed",
  rechecked: "Re-checked",
  released: "Released",
  flagged_for_recheck: "Marked for re-check",
};

export function isEquipmentReservationAction(value: string): value is EquipmentReservationAction {
  return (equipmentReservationActions as readonly string[]).includes(value);
}

/**
 * Event statuses for which reservations can be made, changed or re-checked.
 * Mirrors public.lock_requirement_for_reservation (202610061002), which is
 * authoritative. Pending Safety Check is not one of them.
 */
export function isEquipmentReservationAllowed(eventStatus: string) {
  return eventStatus === "requested" || eventStatus === "planning" || eventStatus === "confirmed";
}

type Snapshot = { quantity?: unknown };

function quantityOf(value: unknown) {
  const quantity = (value as Snapshot | null)?.quantity;
  return typeof quantity === "number" ? quantity : null;
}

/** One line describing what a history entry changed. */
export function describeEquipmentReservationEvent(action: EquipmentReservationAction, details: unknown) {
  const record = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
  switch (action) {
    case "reserved": {
      const quantity = quantityOf(record);
      return quantity === null ? "Reserved" : `Reserved ${quantity}`;
    }
    case "changed": {
      const previous = quantityOf(record.previous);
      const next = quantityOf(record.new);
      if (previous !== null && next !== null && previous !== next) return `Quantity ${previous} → ${next}`;
      return "Period updated to match the request";
    }
    case "rechecked":
      return "Re-checked — still fits";
    case "released": {
      const quantity = quantityOf(record);
      const reason = typeof record.reason === "string" && record.reason ? `: ${record.reason}` : "";
      return `${quantity === null ? "Released" : `Released ${quantity}`}${reason}`;
    }
    case "flagged_for_recheck":
      return typeof record.reason === "string" ? record.reason : "Needs re-checking";
  }
}
