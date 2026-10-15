import {
  currentEquipmentArrangement,
  isEquipmentArrangementStatus,
  type EquipmentArrangementEntry,
  type EquipmentArrangementFormValues,
  type EquipmentArrangementState,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

/**
 * SPM-28: the arrangement status, note and history of each equipment
 * requirement on the given events, keyed by requirement id. Read under RLS
 * (Technical Support Staff, or the event's assigned coordinator). A
 * requirement with no entries is absent; show it with
 * currentEquipmentArrangement([]), which is Not started.
 */
export async function loadEquipmentArrangementStatuses(
  eventIds: string[],
): Promise<Map<string, EquipmentArrangementState>> {
  if (eventIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("equipment_arrangement_updates")
    .select(
      `
        id,
        requirement_id,
        status,
        note,
        updated_at,
        updated_by_profile:profiles!equipment_arrangement_updates_updated_by_fkey (full_name)
      `,
    )
    .in("event_id", eventIds)
    .order("id", { ascending: true });

  if (error) throw new Error("We couldn't load the equipment arrangement statuses.");

  const entriesByRequirement = new Map<string, EquipmentArrangementEntry[]>();
  for (const row of data) {
    // Anything unexpected is skipped rather than shown under a wrong label.
    if (!isEquipmentArrangementStatus(row.status)) continue;
    const entry: EquipmentArrangementEntry = {
      id: row.id,
      status: row.status,
      note: row.note,
      updatedByName: row.updated_by_profile?.full_name ?? null,
      updatedAt: row.updated_at,
    };
    entriesByRequirement.set(row.requirement_id, [...(entriesByRequirement.get(row.requirement_id) ?? []), entry]);
  }

  return new Map(
    [...entriesByRequirement].map(([requirementId, entries]) => [
      requirementId,
      currentEquipmentArrangement(entries),
    ]),
  );
}

/**
 * Records a new arrangement status and note (all checks are in the
 * database). Resolves to false when nothing changed, so no history entry
 * was added.
 */
export async function updateEquipmentArrangement(
  requirementId: string,
  values: EquipmentArrangementFormValues,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("update_equipment_arrangement", {
    p_requirement_id: requirementId,
    p_status: values.status,
    p_note: values.note.trim(),
  });
  if (error) throw new Error(error.message);
  return data !== null;
}
