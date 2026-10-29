import { currentEquipmentArrangement, type EquipmentArrangementStatus } from "@spm/shared";
import { describe, expect, it } from "vitest";

import type {
  EquipmentAvailabilityResult,
  EventEquipmentAvailability,
} from "@/features/equipment/services/equipment-availability";

import {
  arrangementStatusesLoaded,
  equipmentRequestTab,
  equipmentRequestTabCounts,
  eventsInEquipmentRequestTab,
} from "./request-groups";

const arrangement = (status: EquipmentArrangementStatus) =>
  status === "not_started"
    ? currentEquipmentArrangement([])
    : currentEquipmentArrangement([{ id: 1, status, note: null, updatedByName: "Sam", updatedAt: "2099-01-01T00:00:00Z" }]);

const result = (requirementId: string, status: EquipmentArrangementStatus | null): EquipmentAvailabilityResult => ({
  requirementId,
  equipmentItemId: "item-proj",
  equipmentName: "Projector",
  itemCode: "proj",
  itemRetired: false,
  requestedQuantity: 5,
  requiredFrom: "2099-01-01T01:00:00Z",
  requiredUntil: "2099-01-01T05:00:00Z",
  technicalRequirements: null,
  totalUnits: 100,
  reservedQuantity: 0,
  unavailableQuantity: 0,
  availableQuantity: 100,
  status: "available",
  reservation: null,
  arrangement: status ? arrangement(status) : null,
});

const event = (id: string, results: EquipmentAvailabilityResult[]): EventEquipmentAvailability => ({
  id,
  title: id,
  status: "planning",
  startsAt: null,
  endsAt: null,
  results,
});

describe("Event requests tabs: All / Need attention / Arranged / Issue", () => {
  const events = [
    event("expo", [result("a", "not_started"), result("b", "issue"), result("c", "in_progress")]),
    event("talk", [result("d", "not_started"), result("e", "arranged")]),
  ];
  const ids = (tab: Parameters<typeof eventsInEquipmentRequestTab>[1]) =>
    eventsInEquipmentRequestTab(events, tab).map(({ event, results }) => [
      event.id,
      results.map((item) => item.requirementId),
    ]);

  // Not started and In progress are both still being arranged.
  it("lists Not started and In progress items under Need attention, and leaves out events with none", () => {
    expect(ids("attention")).toEqual([
      ["expo", ["a", "c"]],
      ["talk", ["d"]],
    ]);
    expect(ids("arranged")).toEqual([["talk", ["e"]]]);
    expect(ids("issue")).toEqual([["expo", ["b"]]]);
  });

  it("lists every item under All", () => {
    expect(ids("all")).toEqual([
      ["expo", ["a", "b", "c"]],
      ["talk", ["d", "e"]],
    ]);
  });

  it("counts each tab, with All the sum of the other three", () => {
    expect(equipmentRequestTabCounts(events)).toEqual({ all: 5, attention: 3, arranged: 1, issue: 1 });
  });

  // Something wrong goes under Issue whatever the arrangement status says.
  it.each([
    ["an Arranged item that is not available in full", { ...result("x", "arranged"), status: "partially_available" as const }],
    ["a Not started item that is unavailable", { ...result("x", "not_started"), status: "unavailable" as const }],
    [
      "an Arranged item whose reservation needs re-checking",
      {
        ...result("x", "arranged"),
        reservation: { id: "r", quantity: 5, needsRecheck: true, recheckReason: "The event date or time changed" },
      } as unknown as EquipmentAvailabilityResult,
    ],
  ])("puts %s under Issue", (_what, item) => {
    expect(equipmentRequestTab(item)).toBe("issue");
  });

  it("knows when the statuses couldn't be loaded", () => {
    expect(arrangementStatusesLoaded(events)).toBe(true);
    expect(arrangementStatusesLoaded([event("expo", [result("a", null)])])).toBe(false);
  });

  it("puts reservations whose request was removed under Issue", () => {
    const orphan = {
      id: "res-orphan",
      equipmentName: "Projector",
      quantity: 5,
      startsAt: "2099-01-01T01:00:00Z",
      endsAt: "2099-01-01T05:00:00Z",
      recheckReason: "The equipment request was removed",
      reservedByName: null,
      reservedAt: null,
    };
    const withOrphan = [{ ...event("gala", []), orphanedReservations: [orphan] }];

    expect(equipmentRequestTabCounts(withOrphan)).toEqual({ all: 1, attention: 0, arranged: 0, issue: 1 });
    expect(eventsInEquipmentRequestTab(withOrphan, "issue").map(({ event, orphanedReservations }) => [event.id, orphanedReservations.length])).toEqual([["gala", 1]]);
    expect(eventsInEquipmentRequestTab(withOrphan, "all").map(({ orphanedReservations }) => orphanedReservations.length)).toEqual([1]);
    expect(eventsInEquipmentRequestTab(withOrphan, "attention")).toEqual([]);
  });
});
