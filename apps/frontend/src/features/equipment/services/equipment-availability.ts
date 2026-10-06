import {
  isEquipmentAvailabilityStatus,
  type EquipmentAvailabilityStatus,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

/** Events whose equipment Technical Support Staff still need to arrange. */
const OPEN_STATUSES = ["requested", "planning", "confirmed"] as const;

export type EquipmentAvailabilityResult = {
  requirementId: string;
  equipmentItemId: string | null;
  equipmentName: string;
  itemCode: string | null;
  itemRetired: boolean;
  requestedQuantity: number;
  requiredFrom: string | null;
  requiredUntil: string | null;
  technicalRequirements: string | null;
  totalUnits: number;
  reservedQuantity: number;
  unavailableQuantity: number;
  availableQuantity: number;
  status: EquipmentAvailabilityStatus;
  /** The live reservation for this request, if Technical Support Staff made one. */
  reservation: {
    id: string;
    quantity: number;
    needsRecheck: boolean;
    recheckReason: string | null;
    reservedByName: string | null;
    reservedAt: string | null;
  } | null;
};

export type EventEquipmentAvailability = {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  results: EquipmentAvailabilityResult[];
};

/**
 * SPM-31: every open event that has equipment requirements, each with an
 * availability result per requested item. The calculation itself is
 * public.check_event_equipment_availability (202610061001).
 */
export async function listEventEquipmentAvailability(): Promise<EventEquipmentAvailability[]> {
  const { data: events, error } = await supabase
    .from("events")
    .select("id, title, status, starts_at, ends_at, event_equipment_requirements!inner (id)")
    .in("status", [...OPEN_STATUSES])
    .order("starts_at", { ascending: true, nullsFirst: false });

  if (error) throw new Error("We couldn't load events that need equipment.");
  if (events.length === 0) return [];

  const { data: rows, error: checkError } = await supabase.rpc("check_event_equipment_availability", {
    p_event_ids: events.map((event) => event.id),
  });

  if (checkError) throw new Error("We couldn't check equipment availability.");

  const resultsByEvent = new Map<string, EquipmentAvailabilityResult[]>();
  for (const row of rows ?? []) {
    const result: EquipmentAvailabilityResult = {
      requirementId: row.requirement_id,
      equipmentItemId: row.equipment_item_id,
      equipmentName: row.equipment_name,
      itemCode: row.item_code,
      itemRetired: row.item_retired,
      requestedQuantity: row.requested_quantity,
      requiredFrom: row.required_from,
      requiredUntil: row.required_until,
      technicalRequirements: row.technical_requirements,
      totalUnits: row.total_units,
      reservedQuantity: row.reserved_quantity,
      unavailableQuantity: row.unavailable_quantity,
      availableQuantity: row.available_quantity,
      // Anything unexpected is shown as unknown rather than as available.
      status: isEquipmentAvailabilityStatus(row.status) ? row.status : "unknown",
      reservation:
        row.reservation_id && row.reservation_quantity !== null
          ? {
              id: row.reservation_id,
              quantity: row.reservation_quantity,
              needsRecheck: row.reservation_needs_recheck,
              recheckReason: row.reservation_recheck_reason,
              reservedByName: row.reserved_by_name,
              reservedAt: row.reserved_at,
            }
          : null,
    };
    resultsByEvent.set(row.event_id, [...(resultsByEvent.get(row.event_id) ?? []), result]);
  }

  return events.map((event) => ({
    id: event.id,
    title: event.title,
    status: event.status,
    startsAt: event.starts_at,
    endsAt: event.ends_at,
    results: resultsByEvent.get(event.id) ?? [],
  }));
}

/** Reserves a requested item (all checks, including availability, are in the database). */
export async function reserveEquipment(requirementId: string, quantity: number) {
  const { error } = await supabase.rpc("reserve_equipment", {
    p_requirement_id: requirementId,
    p_quantity: quantity,
  });
  if (error) throw new Error(error.message);
}

/** Changes a reservation's quantity; with the same quantity, re-checks it. */
export async function changeEquipmentReservation(reservationId: string, quantity: number) {
  const { error } = await supabase.rpc("change_equipment_reservation", {
    p_reservation_id: reservationId,
    p_quantity: quantity,
  });
  if (error) throw new Error(error.message);
}

export async function releaseEquipmentReservation(reservationId: string, reason: string) {
  const { error } = await supabase.rpc("release_equipment_reservation", {
    p_reservation_id: reservationId,
    p_reason: reason.trim() || undefined,
  });
  if (error) throw new Error(error.message);
}
