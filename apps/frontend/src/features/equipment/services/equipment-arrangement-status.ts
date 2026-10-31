import { isEquipmentArrangementStatus, type EquipmentArrangementEntry } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

/**
 * SPM-28: the arrangement history of each equipment requirement on the given
 * events, keyed by requirement id, oldest first. The database records an
 * entry whenever a reservation is made, changed, released or re-checked, or
 * the request changes. Read under RLS (Technical Support Staff, or the
 * event's assigned coordinator). A requirement with no entries is absent.
 * The status itself always comes from the reservation: pass the entries to
 * currentEquipmentArrangement with the automatic status.
 */
export async function loadEquipmentArrangementHistory(
  eventIds: string[],
): Promise<Map<string, EquipmentArrangementEntry[]>> {
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

  return entriesByRequirement;
}
