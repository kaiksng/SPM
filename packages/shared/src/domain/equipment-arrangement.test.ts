import { describe, expect, it } from "vitest";

import {
  automaticEquipmentArrangementStatus,
  currentEquipmentArrangement,
  equipmentArrangementStatusLabels,
  equipmentArrangementStatuses,
  isEquipmentArrangementStatus,
} from "./equipment-arrangement";

describe("equipment arrangement status", () => {
  // AC01: the fixed list, in order.
  it("offers Not started, In progress, Arranged and Issue", () => {
    expect(equipmentArrangementStatuses.map((status) => equipmentArrangementStatusLabels[status])).toEqual([
      "Not started",
      "In progress",
      "Arranged",
      "Issue",
    ]);
  });

  it("recognises the stored statuses", () => {
    expect(isEquipmentArrangementStatus("arranged")).toBe(true);
    expect(isEquipmentArrangementStatus("reserved")).toBe(false);
  });

  // AC02: nothing recorded yet.
  it("starts at Not started with no history", () => {
    expect(currentEquipmentArrangement([])).toEqual({
      status: "not_started",
      updatedByName: null,
      updatedAt: null,
      history: [],
    });
  });

  // AC03: history stays oldest first; the latest entry says who updated it last.
  it("keeps every entry in order and reports the latest update", () => {
    const state = currentEquipmentArrangement(
      [
        { id: 3, status: "in_progress", note: "Reserved 3 of 5", updatedByName: "Sam", updatedAt: "2099-01-01T03:00:00Z" },
        { id: 1, status: "not_started", note: "Reservation released", updatedByName: "Sam", updatedAt: "2099-01-01T01:00:00Z" },
        { id: 2, status: "arranged", note: "Reserved 5 of 5", updatedByName: "Lee", updatedAt: "2099-01-01T02:00:00Z" },
      ],
      "in_progress",
    );

    expect(state).toMatchObject({ status: "in_progress", updatedByName: "Sam", updatedAt: "2099-01-01T03:00:00Z" });
    expect(state.history.map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  // AC02: the status always follows the reservation, whatever the history says.
  it("always shows the automatic status", () => {
    expect(
      currentEquipmentArrangement(
        [{ id: 1, status: "issue", note: "Request changed", updatedByName: "Sam", updatedAt: "2099-01-01T01:00:00Z" }],
        "arranged",
      ),
    ).toMatchObject({ status: "arranged" });
  });

  it("works out the automatic status from the reservation and availability", () => {
    const status = (
      reservation: { quantity: number; needsRecheck: boolean } | null,
      canReserveInFull = true,
    ) => automaticEquipmentArrangementStatus({ requestedQuantity: 5, reservation, canReserveInFull });

    expect(status({ quantity: 5, needsRecheck: false })).toBe("arranged");
    expect(status({ quantity: 3, needsRecheck: false })).toBe("in_progress");
    expect(status({ quantity: 5, needsRecheck: true })).toBe("issue");
    expect(status(null)).toBe("not_started");
    expect(status(null, false)).toBe("issue");
  });
});
