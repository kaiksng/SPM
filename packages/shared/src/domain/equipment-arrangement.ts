/**
 * SPM-28 arrangement statuses, as public.equipment_arrangement_updates
 * stores them (202610150001). Keep the two in step. Never set by hand: the
 * status always follows the reservation (automaticEquipmentArrangementStatus).
 */
export const equipmentArrangementStatuses = ["not_started", "in_progress", "arranged", "issue"] as const;

export type EquipmentArrangementStatus = (typeof equipmentArrangementStatuses)[number];

export const equipmentArrangementStatusLabels: Readonly<Record<EquipmentArrangementStatus, string>> = {
  not_started: "Not started",
  in_progress: "In progress",
  arranged: "Arranged",
  issue: "Issue",
};

/** A requirement nobody has updated and nothing has happened to yet. */
export const initialEquipmentArrangementStatus: EquipmentArrangementStatus = "not_started";

export function isEquipmentArrangementStatus(value: string): value is EquipmentArrangementStatus {
  return (equipmentArrangementStatuses as readonly string[]).includes(value);
}

export type EquipmentArrangementEntry = {
  id: number;
  status: EquipmentArrangementStatus;
  note: string | null;
  updatedByName: string | null;
  updatedAt: string;
};

export type EquipmentArrangementState = {
  /** Always worked out from the reservation (AC02). */
  status: EquipmentArrangementStatus;
  /** Who made the latest recorded update, and when. */
  updatedByName: string | null;
  updatedAt: string | null;
  /** Every update the system recorded, oldest first (AC03). */
  history: EquipmentArrangementEntry[];
};

/**
 * The current arrangement: the automatic status (AC02), with the recorded
 * updates as its history. Entries are ordered by id, which follows
 * insertion order.
 */
export function currentEquipmentArrangement(
  entries: readonly EquipmentArrangementEntry[],
  automaticStatus: EquipmentArrangementStatus = initialEquipmentArrangementStatus,
): EquipmentArrangementState {
  const history = [...entries].sort((left, right) => left.id - right.id);
  const latest = history[history.length - 1];
  return {
    status: automaticStatus,
    updatedByName: latest?.updatedByName ?? null,
    updatedAt: latest?.updatedAt ?? null,
    history,
  };
}

/**
 * AC02: a requirement's status, from what has happened to it.
 * - Reserved in full: Arranged. Partly reserved: In progress.
 * - Reservation flagged for re-check: Issue.
 * - Not reserved and can't be reserved in full (short, retired, or the
 *   event's reservations are locked): Issue.
 * - Otherwise: Not started.
 */
export function automaticEquipmentArrangementStatus(input: {
  requestedQuantity: number;
  /** The live reservation, if any. */
  reservation: { quantity: number; needsRecheck: boolean } | null;
  /** Whether the whole request could be reserved now. */
  canReserveInFull: boolean;
}): EquipmentArrangementStatus {
  const { reservation } = input;
  if (reservation) {
    if (reservation.needsRecheck) return "issue";
    return reservation.quantity >= input.requestedQuantity ? "arranged" : "in_progress";
  }
  return input.canReserveInFull ? "not_started" : "issue";
}
