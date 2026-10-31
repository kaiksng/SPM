import { equipmentItemSchema, type EquipmentItemFormValues } from "@spm/shared";

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

/** The catalogue's read-only, item-level fields — no per-unit detail (RLS keeps that Technical Support Staff-only). */
export type EquipmentCatalogueItem = {
  id: string;
  name: string;
  category: string | null;
  code: string;
  totalQuantity: number;
  retiredAt: string | null;
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

/** Every catalogue item's name/category/code/quantity only — for roles other than Technical Support Staff, who can read equipment_items but not per-unit detail. */
export async function listEquipmentCatalogue(): Promise<EquipmentCatalogueItem[]> {
  const { data, error } = await supabase
    .from("equipment_items")
    .select("id, name, category, code, total_quantity, retired_at")
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw new Error("We couldn't load the equipment catalogue.");

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    code: row.code,
    totalQuantity: row.total_quantity,
    retiredAt: row.retired_at,
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
