import type { EquipmentArrangementStatus } from "@spm/shared";

import type {
  EquipmentAvailabilityResult,
  EventEquipmentAvailability,
} from "@/features/equipment/services/equipment-availability";

/**
 * The Event requests tabs follow each item's arrangement status (SPM-28):
 * Not started / In progress / Arranged / Issue. Availability and
 * reservations still show inside each item's row.
 */
export function eventsWithArrangementStatus(events: EventEquipmentAvailability[], status: EquipmentArrangementStatus) {
  return events.flatMap((event) => {
    const results = event.results.filter((result) => result.arrangement?.status === status);
    return results.length > 0 ? [{ event, results }] : [];
  });
}

/** How many items have each arrangement status, across all events. */
export function arrangementStatusCounts(
  events: EventEquipmentAvailability[],
): Record<EquipmentArrangementStatus, number> {
  const counts: Record<EquipmentArrangementStatus, number> = { not_started: 0, in_progress: 0, arranged: 0, issue: 0 };
  for (const event of events) {
    for (const result of event.results) if (result.arrangement) counts[result.arrangement.status] += 1;
  }
  return counts;
}

/** False when the arrangement statuses couldn't be loaded, so items can't be sorted by them. */
export function arrangementStatusesLoaded(events: EventEquipmentAvailability[]) {
  return events.every((event) => event.results.every((result: EquipmentAvailabilityResult) => result.arrangement));
}
