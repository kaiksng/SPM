import { currentEquipmentArrangement, type EquipmentArrangementStatus } from "@spm/shared";
import { describe, expect, it } from "vitest";

import type {
  EquipmentAvailabilityResult,
  EventEquipmentAvailability,
} from "@/features/equipment/services/equipment-availability";

import { arrangementStatusCounts, arrangementStatusesLoaded, eventsWithArrangementStatus } from "./request-groups";

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

describe("arrangement status tabs (SPM-28)", () => {
  const events = [
    event("expo", [result("a", "not_started"), result("b", "issue"), result("c", "in_progress")]),
    event("talk", [result("d", "not_started")]),
  ];

  it("keeps only each event's items with that status, and leaves out events with none", () => {
    expect(
      eventsWithArrangementStatus(events, "not_started").map(({ event, results }) => [
        event.id,
        results.map((item) => item.requirementId),
      ]),
    ).toEqual([
      ["expo", ["a"]],
      ["talk", ["d"]],
    ]);
    expect(eventsWithArrangementStatus(events, "arranged")).toEqual([]);
  });

  it("counts items per status", () => {
    expect(arrangementStatusCounts(events)).toEqual({ not_started: 2, in_progress: 1, arranged: 0, issue: 1 });
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

    expect(arrangementStatusCounts(withOrphan)).toEqual({ not_started: 0, in_progress: 0, arranged: 0, issue: 1 });
    expect(eventsWithArrangementStatus(withOrphan, "issue").map(({ event, orphanedReservations }) => [event.id, orphanedReservations.length])).toEqual([["gala", 1]]);
    expect(eventsWithArrangementStatus(withOrphan, "not_started")).toEqual([]);
  });
});
