import { isEquipmentReservationAction, type EquipmentReservationAction } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type EquipmentReservationHistoryEntry = {
  id: number;
  action: EquipmentReservationAction;
  details: unknown;
  actorName: string | null;
  occurredAt: string;
};

export type EquipmentArrangement = {
  id: string;
  requirementId: string | null;
  equipmentName: string;
  quantity: number;
  startsAt: string;
  endsAt: string;
  status: "reserved" | "released";
  reservedByName: string | null;
  reservedAt: string | null;
  needsRecheck: boolean;
  recheckReason: string | null;
  releasedAt: string | null;
  /** Why it was released, e.g. "The event was completed" (SPM-46 AC06). */
  releaseReason: string | null;
  history: EquipmentReservationHistoryEntry[];
};

/** The reason release_reservations_on_event_end (202610150002) records. */
export const EVENT_COMPLETED_RELEASE_REASON = "The event was completed";

function releaseReasonOf(history: EquipmentReservationHistoryEntry[]): string | null {
  const release = history.findLast((entry) => entry.action === "released");
  const details = release?.details;
  if (details && typeof details === "object" && "reason" in details && typeof details.reason === "string") {
    return details.reason;
  }
  return null;
}

/**
 * The event's equipment reservations made by Technical Support Staff, with
 * their history — read straight from the tables under RLS (anyone who can
 * view the event can see them).
 */
export async function listEquipmentArrangements(eventId: string): Promise<EquipmentArrangement[]> {
  const { data, error } = await supabase
    .from("equipment_reservations")
    .select(
      `
        id,
        requirement_id,
        quantity,
        starts_at,
        ends_at,
        status,
        decided_at,
        needs_recheck,
        recheck_reason,
        released_at,
        equipment_item:equipment_items (name),
        reserved_by:profiles!equipment_reservations_decided_by_fkey (full_name),
        history:equipment_reservation_events (
          id,
          action,
          details,
          occurred_at,
          actor:profiles!equipment_reservation_events_actor_fkey (full_name)
        )
      `,
    )
    .eq("event_id", eventId)
    // Staff reservations are created approved; released ones are kept for
    // the record. Pending coordinator requests are not arrangements yet.
    .in("status", ["approved", "cancelled"])
    .not("decided_at", "is", null)
    .order("starts_at", { ascending: true });

  if (error) throw new Error("The equipment arrangements for this event are unavailable.");

  return data.map((row): EquipmentArrangement => {
    const history = row.history
      .flatMap((entry) =>
        isEquipmentReservationAction(entry.action)
          ? [
              {
                id: entry.id,
                action: entry.action,
                details: entry.details,
                actorName: entry.actor?.full_name ?? null,
                occurredAt: entry.occurred_at,
              },
            ]
          : [],
      )
      .sort((left, right) => left.id - right.id);

    return {
      id: row.id,
      requirementId: row.requirement_id,
      equipmentName: row.equipment_item?.name ?? "Equipment",
      quantity: row.quantity,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      status: row.status === "approved" ? "reserved" : "released",
      reservedByName: row.reserved_by?.full_name ?? null,
      reservedAt: row.decided_at,
      needsRecheck: row.needs_recheck,
      recheckReason: row.recheck_reason,
      releasedAt: row.released_at,
      releaseReason: releaseReasonOf(history),
      history,
    };
  });
}
