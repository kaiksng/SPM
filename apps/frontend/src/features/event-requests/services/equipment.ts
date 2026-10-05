import {
  isEquipmentChangeType,
  parseEquipmentSnapshot,
  type EquipmentChangeType,
  type EquipmentRequirementFormValues,
  type EquipmentSnapshot,
} from "@spm/shared";

import { localDateTime } from "@/features/event-requests/utils/local-date-time";
import { supabase } from "@/lib/supabase-client";

export type EquipmentCatalogueItem = {
  id: string;
  name: string;
  category: string | null;
};

/** The equipment_items catalogue, ordered for a grouped dropdown (AC02). */
export async function loadEquipmentCatalogue(): Promise<EquipmentCatalogueItem[]> {
  const { data, error } = await supabase
    .from("equipment_items")
    .select("id, name, category")
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) {
    throw new Error("The equipment catalogue is unavailable. Try again.");
  }

  return data ?? [];
}

/**
 * One embedded row as every event loader selects it:
 * `event_equipment_requirements (id, equipment_item_id, equipment_name,
 * quantity, required_from, required_until, notes,
 * equipment_item:equipment_items (category))`.
 */
export type EquipmentRequirementRow = {
  id: string;
  equipment_item_id: string | null;
  equipment_name: string;
  quantity: number;
  required_from: string | null;
  required_until: string | null;
  notes: string | null;
  equipment_item: { category: string | null } | null;
};

/** A saved requirement as read-only detail, e.g. on EventDetailPage. */
export type EquipmentRequirement = {
  id: string;
  equipmentItemId: string | null;
  equipmentName: string;
  category: string | null;
  quantity: number;
  requiredFrom: string | null;
  requiredUntil: string | null;
  technicalRequirements: string | null;
};

export function toEquipmentRequirements(rows: EquipmentRequirementRow[]): EquipmentRequirement[] {
  return sortRequirements(rows).map((row) => ({
    id: row.id,
    equipmentItemId: row.equipment_item_id,
    equipmentName: row.equipment_name,
    category: row.equipment_item?.category ?? null,
    quantity: row.quantity,
    requiredFrom: row.required_from,
    requiredUntil: row.required_until,
    technicalRequirements: row.notes,
  }));
}

/** Saved rows in the form's shape; a legacy row keeps its name for display (AC13). */
export function toEquipmentFormValues(
  requirements: EquipmentRequirement[],
): EquipmentRequirementFormValues[] {
  return requirements.map((item) => ({
    id: item.id,
    equipmentItemId: item.equipmentItemId ?? "",
    legacyName: item.equipmentItemId ? "" : item.equipmentName,
    quantity: item.quantity.toString(),
    requiredFrom: localDateTime(item.requiredFrom),
    requiredUntil: localDateTime(item.requiredUntil),
    notes: item.technicalRequirements ?? "",
  }));
}

// PostgREST returns embedded rows in no guaranteed order; show them by when
// they are needed, legacy rows (no period) last.
function sortRequirements(rows: EquipmentRequirementRow[]) {
  return [...rows].sort((left, right) => {
    if (left.required_from === right.required_from) {
      return left.equipment_name.localeCompare(right.equipment_name);
    }
    if (!left.required_from) return 1;
    if (!right.required_from) return -1;
    return left.required_from.localeCompare(right.required_from);
  });
}

export type EquipmentChange = {
  id: number;
  changeType: EquipmentChangeType;
  previous: EquipmentSnapshot | null;
  next: EquipmentSnapshot | null;
  changedByName: string | null;
  changedAt: string;
};

/**
 * AC07/AC08. RLS limits this to the event's assigned coordinator and to
 * Technical Support Staff; anyone else gets an empty list rather than an
 * error, the same way loadEventFieldHistory behaves.
 */
export async function loadEquipmentHistory(eventId: string): Promise<EquipmentChange[]> {
  const { data, error } = await supabase
    .from("event_equipment_changes")
    .select(
      `
        id,
        change_type,
        previous_value,
        new_value,
        changed_at,
        changed_by:profiles!event_equipment_changes_changed_by_fkey (full_name)
      `,
    )
    .eq("event_id", eventId)
    // One save can log several rows with the same changed_at; id keeps
    // them in the order they were written.
    .order("changed_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error("The equipment history for this event is unavailable.");
  }

  return (data ?? []).flatMap((row) =>
    isEquipmentChangeType(row.change_type)
      ? [
          {
            id: row.id,
            changeType: row.change_type,
            previous: parseEquipmentSnapshot(row.previous_value),
            next: parseEquipmentSnapshot(row.new_value),
            changedByName: row.changed_by?.full_name ?? null,
            changedAt: row.changed_at,
          },
        ]
      : [],
  );
}
