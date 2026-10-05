/**
 * One equipment requirement as recorded in `event_equipment_changes` — the
 * shape `public.event_equipment_snapshot` builds in
 * `202610050004_record_event_equipment_requirements.sql`. Keep the two in
 * step.
 */
export type EquipmentSnapshot = {
  equipmentItemId: string | null;
  equipmentName: string;
  category: string | null;
  quantity: number;
  requiredFrom: string | null;
  requiredUntil: string | null;
  technicalRequirements: string | null;
};

export const equipmentChangeTypes = ["added", "changed", "removed"] as const;

export type EquipmentChangeType = (typeof equipmentChangeTypes)[number];

/** The snapshot fields a "changed" history entry reports on, in display order. */
export const equipmentSnapshotFields = [
  "equipmentName",
  "quantity",
  "requiredFrom",
  "requiredUntil",
  "technicalRequirements",
] as const;

export type EquipmentSnapshotField = (typeof equipmentSnapshotFields)[number];

export const equipmentSnapshotFieldLabels: Readonly<Record<EquipmentSnapshotField, string>> = {
  equipmentName: "Equipment",
  quantity: "Quantity",
  requiredFrom: "Required from",
  requiredUntil: "Required until",
  technicalRequirements: "Technical requirements",
};

export const equipmentChangeTypeLabels: Readonly<Record<EquipmentChangeType, string>> = {
  added: "Added",
  changed: "Changed",
  removed: "Removed",
};

export function isEquipmentChangeType(value: string): value is EquipmentChangeType {
  return (equipmentChangeTypes as readonly string[]).includes(value);
}

/**
 * Reads a stored snapshot defensively: the column is plain jsonb, so anything
 * that is not an object with an equipment name is treated as absent.
 */
export function parseEquipmentSnapshot(value: unknown): EquipmentSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.equipmentName !== "string") return null;

  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : null);

  return {
    equipmentItemId: text("equipmentItemId"),
    equipmentName: record.equipmentName,
    category: text("category"),
    quantity: typeof record.quantity === "number" ? record.quantity : Number(record.quantity),
    requiredFrom: text("requiredFrom"),
    requiredUntil: text("requiredUntil"),
    technicalRequirements: text("technicalRequirements"),
  };
}

/** Which reported fields differ between two snapshots of one requirement. */
export function changedEquipmentFields(
  previous: EquipmentSnapshot,
  next: EquipmentSnapshot,
): EquipmentSnapshotField[] {
  return equipmentSnapshotFields.filter((field) => previous[field] !== next[field]);
}
