/**
 * Router state for opening an event's Equipment page with its Request
 * equipment dialog already open — used by the Equipment catalogue's
 * "Add equipment" button once the coordinator has chosen the event.
 */
export const OPEN_EQUIPMENT_REQUEST_STATE = { openEquipmentRequest: true } as const;

export function wantsEquipmentRequest(state: unknown) {
  return (state as { openEquipmentRequest?: boolean } | null)?.openEquipmentRequest === true;
}
