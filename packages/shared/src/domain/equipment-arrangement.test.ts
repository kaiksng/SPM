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
  it("starts at Not started with no note or history", () => {
    expect(currentEquipmentArrangement([])).toEqual({
      status: "not_started",
      automatic: true,
      note: null,
      updatedByName: null,
      updatedAt: null,
      history: [],
    });
  });

  // AC03/AC05: the latest entry is current; history stays oldest first.
  it("takes the latest entry as current and keeps every entry in order", () => {
    const state = currentEquipmentArrangement([
      { id: 3, status: "in_progress", note: null, updatedByName: "Sam", updatedAt: "2099-01-01T03:00:00Z" },
      { id: 1, status: "in_progress", note: "Sourcing", updatedByName: "Sam", updatedAt: "2099-01-01T01:00:00Z" },
      { id: 2, status: "arranged", note: "Delivered", updatedByName: "Lee", updatedAt: "2099-01-01T02:00:00Z" },
    ]);

    expect(state).toMatchObject({
      status: "in_progress",
      automatic: false,
      note: null,
      updatedByName: "Sam",
      updatedAt: "2099-01-01T03:00:00Z",
    });
    expect(state.history.map((entry) => entry.id)).toEqual([1, 2, 3]);
  });

  // AC02: nobody has set it, so it follows what happened.
  it("uses the automatic status until someone sets one by hand", () => {
    expect(currentEquipmentArrangement([], "arranged")).toMatchObject({ status: "arranged", automatic: true });
    expect(
      currentEquipmentArrangement(
        [{ id: 1, status: "issue", note: "Faulty", updatedByName: "Sam", updatedAt: "2099-01-01T01:00:00Z" }],
        "arranged",
      ),
    ).toMatchObject({ status: "issue", automatic: false });
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
