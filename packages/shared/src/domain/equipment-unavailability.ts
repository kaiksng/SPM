/**
 * SPM-30 record lifecycle, derived from the row — mirrors the rules in
 * public.end_equipment_unavailability / public.remove_equipment_unavailability.
 */
export type EquipmentUnavailabilityRecordTimes = {
  startsAt: string;
  endsAt: string;
  endedAt: string | null;
  removedAt: string | null;
};

export type EquipmentUnavailabilityStatus =
  | "upcoming"
  | "in_progress"
  | "ended_early"
  | "past"
  | "removed";

export const equipmentUnavailabilityStatusLabels: Readonly<
  Record<EquipmentUnavailabilityStatus, string>
> = {
  upcoming: "Upcoming",
  in_progress: "In progress",
  ended_early: "Returned early",
  past: "Past",
  removed: "Removed",
};

export function equipmentUnavailabilityStatus(
  record: EquipmentUnavailabilityRecordTimes,
  now: Date = new Date(),
): EquipmentUnavailabilityStatus {
  if (record.removedAt) return "removed";
  if (record.endedAt) return "ended_early";
  const time = now.getTime();
  if (new Date(record.endsAt).getTime() <= time) return "past";
  if (new Date(record.startsAt).getTime() > time) return "upcoming";
  return "in_progress";
}

/** Whether "End" is allowed: only while the outage is under way. */
export function canEndEquipmentUnavailability(status: EquipmentUnavailabilityStatus) {
  return status === "in_progress";
}

/** Whether "Remove" is allowed: anything not yet over or removed. */
export function canRemoveEquipmentUnavailability(status: EquipmentUnavailabilityStatus) {
  return status === "upcoming" || status === "in_progress";
}

/** The period a record actually blocks equipment for (AC04). */
export function effectiveUnavailabilityEnd(record: EquipmentUnavailabilityRecordTimes) {
  return record.endedAt ?? record.endsAt;
}

/** Half-open [start, end) overlap, the same rule the database uses. */
export function periodsOverlap(
  first: { startsAt: string; endsAt: string },
  second: { startsAt: string; endsAt: string },
) {
  return (
    new Date(first.startsAt).getTime() < new Date(second.endsAt).getTime() &&
    new Date(second.startsAt).getTime() < new Date(first.endsAt).getTime()
  );
}
