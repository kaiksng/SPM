import type {
  EquipmentAvailabilityResult,
  EventEquipmentAvailability,
} from "@/features/equipment/services/equipment-availability";

/**
 * The Event requests tabs: All, then each item in exactly one of
 *   Need attention — still being arranged (Not started / In progress);
 *   Arranged       — reserved in full, with nothing wrong;
 *   Issue          — not available in full, or a reservation flagged for
 *                    re-check. A reservation whose request was removed
 *                    needs releasing, so it is listed under Issue too.
 * The arrangement status itself (SPM-28) still shows on each item.
 */
export const equipmentRequestTabs = ["all", "attention", "arranged", "issue"] as const;
export type EquipmentRequestTab = (typeof equipmentRequestTabs)[number];

export const equipmentRequestTabLabels: Readonly<Record<EquipmentRequestTab, string>> = {
  all: "All",
  attention: "Need attention",
  arranged: "Arranged",
  issue: "Issue",
};

/** Not available in full, or reserved but flagged for re-checking. */
export function hasEquipmentProblem(result: EquipmentAvailabilityResult) {
  return result.status !== "available" || Boolean(result.reservation?.needsRecheck);
}

/** The one status tab an item belongs to. */
export function equipmentRequestTab(result: EquipmentAvailabilityResult): Exclude<EquipmentRequestTab, "all"> {
  if (result.arrangement?.status === "issue" || hasEquipmentProblem(result)) return "issue";
  if (result.arrangement?.status === "arranged") return "arranged";
  return "attention";
}

export function eventsInEquipmentRequestTab(events: EventEquipmentAvailability[], tab: EquipmentRequestTab) {
  return events.flatMap((event) => {
    const results =
      tab === "all" ? event.results : event.results.filter((result) => equipmentRequestTab(result) === tab);
    const orphanedReservations = tab === "all" || tab === "issue" ? (event.orphanedReservations ?? []) : [];
    return results.length > 0 || orphanedReservations.length > 0 ? [{ event, results, orphanedReservations }] : [];
  });
}

/** How many items are in each tab, across all events. */
export function equipmentRequestTabCounts(events: EventEquipmentAvailability[]): Record<EquipmentRequestTab, number> {
  const counts: Record<EquipmentRequestTab, number> = { all: 0, attention: 0, arranged: 0, issue: 0 };
  for (const event of events) {
    for (const result of event.results) counts[equipmentRequestTab(result)] += 1;
    counts.issue += event.orphanedReservations?.length ?? 0;
  }
  counts.all = counts.attention + counts.arranged + counts.issue;
  return counts;
}

/** False when the arrangement statuses couldn't be loaded, so items can't be sorted by them. */
export function arrangementStatusesLoaded(events: EventEquipmentAvailability[]) {
  return events.every((event) => event.results.every((result: EquipmentAvailabilityResult) => result.arrangement));
}
