import {
  equipmentUnavailabilitySchema,
  singaporeLocalToIso,
  type EquipmentUnavailabilityFormValues,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type StockedEquipmentItem = {
  id: string;
  name: string;
  category: string | null;
  totalQuantity: number;
};

/** The catalogue with each item's total stock, for Technical Support Staff. */
export async function listStockedEquipment(): Promise<StockedEquipmentItem[]> {
  const { data, error } = await supabase
    .from("equipment_items")
    .select("id, name, category, total_quantity")
    .order("category", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (error) throw new Error("We couldn't load the equipment catalogue.");

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category,
    totalQuantity: row.total_quantity,
  }));
}

/** RLS limits catalogue writes to Technical Support Staff. */
export async function updateEquipmentStock(itemId: string, totalQuantity: number) {
  const { data, error } = await supabase
    .from("equipment_items")
    .update({ total_quantity: totalQuantity })
    .eq("id", itemId)
    .select("id");

  if (error || !data?.length) throw new Error("The stock could not be updated.");
}

export type EquipmentUnavailabilityRecord = {
  id: string;
  equipmentItemId: string;
  equipmentName: string;
  quantity: number;
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

/** Every record, current and past (AC06), newest period first. */
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
 * AC03: Pending and Confirmed reservations of one item that overlap a
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
  const parsed = equipmentUnavailabilitySchema.parse(values);
  const { error } = await supabase.rpc("record_equipment_unavailability", {
    p_equipment_item_id: parsed.equipmentItemId,
    p_quantity: Number(parsed.quantity),
    p_reason: parsed.reason,
    p_starts_at: singaporeLocalToIso(parsed.startsAt),
    p_ends_at: singaporeLocalToIso(parsed.endsAt),
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
