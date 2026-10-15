/**
 * SPM-28 arrangement statuses, as public.equipment_arrangement_updates
 * stores them (202610150001). Keep the two in step. Set by hand by
 * Technical Support Staff; independent of reservations.
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
  status: EquipmentArrangementStatus;
  /** True while nobody has set a status by hand: the status is worked out (AC02). */
  automatic: boolean;
  note: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
  /** Every update, oldest first (AC03). */
  history: EquipmentArrangementEntry[];
};

/**
 * The current arrangement is the latest entry a person made. With none, it
 * is the automatic status (AC02), Not started when that isn't known. Entries
 * are ordered by id, which follows insertion order.
 */
export function currentEquipmentArrangement(
  entries: readonly EquipmentArrangementEntry[],
  automaticStatus: EquipmentArrangementStatus = initialEquipmentArrangementStatus,
): EquipmentArrangementState {
  const history = [...entries].sort((left, right) => left.id - right.id);
  const latest = history[history.length - 1];
  return {
    status: latest?.status ?? automaticStatus,
    automatic: !latest,
    note: latest?.note ?? null,
    updatedByName: latest?.updatedByName ?? null,
    updatedAt: latest?.updatedAt ?? null,
    history,
  };
}

/**
 * AC02: the status of a requirement nobody has set by hand, from what has
 * happened to it.
 * - Reserved in full: Arranged. Partly reserved: In progress.
 * - Reservation flagged for re-check: Issue.
 * - Not reserved and can't be reserved in full (short, unavailable, not in
 *   the catalogue, retired, or the event's reservations are locked): Issue.
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
