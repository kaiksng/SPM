import {
  equipmentItemSchema,
  equipmentUnavailabilitySchema,
  singaporeLocalToIso,
  type EquipmentItemFormValues,
  type EquipmentUnavailabilityFormValues,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type EquipmentUnit = {
  id: string;
  equipmentItemId: string;
  unitNumber: number;
  retiredAt: string | null;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: string | null;
  code: string;
  /** In-service (not retired) units. */
  totalQuantity: number;
  retiredAt: string | null;
  units: EquipmentUnit[];
};

// PostgREST returns at most 1,000 rows per request; there are 100 units per
// item, so units are read in pages.
const PAGE_SIZE = 1000;

async function listAllUnits(): Promise<EquipmentUnit[]> {
  const units: EquipmentUnit[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("equipment_units")
      .select("id, equipment_item_id, unit_number, retired_at")
      .order("equipment_item_id", { ascending: true })
      .order("unit_number", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error("We couldn't load the equipment units.");

    units.push(
      ...data.map((row) => ({
        id: row.id,
        equipmentItemId: row.equipment_item_id,
        unitNumber: row.unit_number,
        retiredAt: row.retired_at,
      })),
    );
    if (data.length < PAGE_SIZE) return units;
  }
}

/** Every catalogue item, retired or not, with its units, for Technical Support Staff. */
export async function listInventory(): Promise<InventoryItem[]> {
  const [{ data, error }, units] = await Promise.all([
    supabase
      .from("equipment_items")
      .select("id, name, category, code, total_quantity, retired_at")
      .order("category", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true }),
    listAllUnits(),
  ]);

  if (error) throw new Error("We couldn't load the equipment catalogue.");

  const unitsByItem = new Map<string, EquipmentUnit[]>();
  for (const unit of units) {
    unitsByItem.set(unit.equipmentItemId, [...(unitsByItem.get(unit.equipmentItemId) ?? []), unit]);
  }

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    code: row.code,
    totalQuantity: row.total_quantity,
    retiredAt: row.retired_at,
    units: unitsByItem.get(row.id) ?? [],
  }));
}

function firstIssue(error: { issues: Array<{ message: string }> }) {
  return error.issues[0]?.message ?? "Check the highlighted fields and try again.";
}

export async function createEquipmentItem(values: EquipmentItemFormValues, units: number) {
  const result = equipmentItemSchema.safeParse(values);
  if (!result.success) throw new Error(firstIssue(result.error));
  const { data, error } = await supabase.rpc("create_equipment_item", {
    p_name: result.data.name,
    p_category: result.data.category,
    p_code: result.data.code,
    p_units: units,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEquipmentItem(itemId: string, values: EquipmentItemFormValues) {
  const result = equipmentItemSchema.safeParse(values);
  if (!result.success) throw new Error(firstIssue(result.error));
  const { error } = await supabase.rpc("update_equipment_item", {
    p_item_id: itemId,
    p_name: result.data.name,
    p_category: result.data.category,
    p_code: result.data.code,
  });
  if (error) throw new Error(error.message);
}

export async function addEquipmentUnits(itemId: string, count: number) {
  const { error } = await supabase.rpc("add_equipment_units", { p_item_id: itemId, p_count: count });
  if (error) throw new Error(error.message);
}

export async function setEquipmentUnitRetired(unitId: string, retired: boolean) {
  const { error } = await supabase.rpc("set_equipment_unit_retired", {
    p_unit_id: unitId,
    p_retired: retired,
  });
  if (error) throw new Error(error.message);
}

export async function setEquipmentItemRetired(itemId: string, retired: boolean) {
  const { error } = await supabase.rpc("set_equipment_item_retired", {
    p_item_id: itemId,
    p_retired: retired,
  });
  if (error) throw new Error(error.message);
}

export type EquipmentUnavailabilityRecord = {
  id: string;
  equipmentItemId: string;
  equipmentName: string;
  quantity: number;
  /** Specific units named on the record, if any. */
  unitIds: string[];
  reason: string;
  startsAt: string;
  endsAt: string;
  recordedAt: string;
  recordedByName: string | null;
  endedAt: string | null;
  endedByName: string | null;
  removedAt: string | null;
  removedByName: string | null;
};

/** Every record, current and past (SPM-30 AC06), newest period first. */
export async function listEquipmentUnavailability(): Promise<EquipmentUnavailabilityRecord[]> {
  const { data, error } = await supabase
    .from("equipment_unavailability")
    .select(
      `
        id,
        equipment_item_id,
        quantity,
        reason,
        starts_at,
        ends_at,
        recorded_at,
        ended_at,
        removed_at,
        equipment_item:equipment_items (name),
        units:equipment_unavailability_units (unit_id),
        recorded_by_profile:profiles!equipment_unavailability_recorded_by_fkey (full_name),
        ended_by_profile:profiles!equipment_unavailability_ended_by_fkey (full_name),
        removed_by_profile:profiles!equipment_unavailability_removed_by_fkey (full_name)
      `,
    )
    .order("starts_at", { ascending: false });

  if (error) throw new Error("We couldn't load the unavailability records.");

  return data.map((row) => ({
    id: row.id,
    equipmentItemId: row.equipment_item_id,
    equipmentName: row.equipment_item?.name ?? "Unknown equipment",
    quantity: row.quantity,
    unitIds: row.units.map((unit) => unit.unit_id),
    reason: row.reason,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    recordedAt: row.recorded_at,
    recordedByName: row.recorded_by_profile?.full_name ?? null,
    endedAt: row.ended_at,
    endedByName: row.ended_by_profile?.full_name ?? null,
    removedAt: row.removed_at,
    removedByName: row.removed_by_profile?.full_name ?? null,
  }));
}

export type EquipmentReservationOverlap = {
  id: string;
  quantity: number;
  status: string;
  startsAt: string;
  endsAt: string;
  eventTitle: string | null;
};

/**
 * SPM-30 AC03: Pending and Confirmed reservations of one item that overlap a
 * period, shown before an unavailability record is saved.
 */
export async function listOverlappingReservations(
  equipmentItemId: string,
  startsAt: string,
  endsAt: string,
): Promise<EquipmentReservationOverlap[]> {
  const { data, error } = await supabase
    .from("equipment_reservations")
    .select("id, quantity, status, starts_at, ends_at, event:events (title)")
    .eq("equipment_item_id", equipmentItemId)
    .in("status", ["pending", "approved"])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt)
    .order("starts_at", { ascending: true });

  if (error) throw new Error("We couldn't check reservations for this period.");

  return data.map((row) => ({
    id: row.id,
    quantity: row.quantity,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    eventTitle: row.event?.title ?? null,
  }));
}

export async function recordEquipmentUnavailability(values: EquipmentUnavailabilityFormValues) {
  // The form validates first; if anything still fails here, surface the
  // plain message rather than the validator's raw error.
  const result = equipmentUnavailabilitySchema.safeParse(values);
  if (!result.success) throw new Error(firstIssue(result.error));
  const parsed = result.data;
  const { error } = await supabase.rpc("record_equipment_unavailability", {
    p_equipment_item_id: parsed.equipmentItemId,
    p_quantity: parsed.unitIds.length > 0 ? parsed.unitIds.length : Number(parsed.quantity),
    p_reason: parsed.reason,
    p_starts_at: singaporeLocalToIso(parsed.startsAt),
    p_ends_at: singaporeLocalToIso(parsed.endsAt),
    p_unit_ids: parsed.unitIds.length > 0 ? parsed.unitIds : undefined,
  });
  if (error) throw new Error(error.message);
}

export async function endEquipmentUnavailability(id: string) {
  const { error } = await supabase.rpc("end_equipment_unavailability", {
    p_unavailability_id: id,
  });
  if (error) throw new Error(error.message);
}

export async function removeEquipmentUnavailability(id: string) {
  const { error } = await supabase.rpc("remove_equipment_unavailability", {
    p_unavailability_id: id,
  });
  if (error) throw new Error(error.message);
}
