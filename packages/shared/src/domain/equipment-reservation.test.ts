import { describe, expect, it } from "vitest";

import { describeEquipmentReservationEvent, isEquipmentReservationAction } from "./equipment-reservation";

describe("equipment reservation history", () => {
  it("describes each action", () => {
    expect(describeEquipmentReservationEvent("reserved", { quantity: 60 })).toBe("Reserved 60");
    expect(
      describeEquipmentReservationEvent("changed", { previous: { quantity: 60 }, new: { quantity: 55 } }),
    ).toBe("Quantity 60 → 55");
    expect(
      describeEquipmentReservationEvent("changed", { previous: { quantity: 5 }, new: { quantity: 5 } }),
    ).toBe("Period updated to match the request");
    expect(describeEquipmentReservationEvent("rechecked", null)).toBe("Re-checked — still fits");
    expect(describeEquipmentReservationEvent("released", { quantity: 40, reason: "Not needed" })).toBe(
      "Released 40: Not needed",
    );
    expect(describeEquipmentReservationEvent("released", { quantity: 40, reason: null })).toBe("Released 40");
    expect(describeEquipmentReservationEvent("flagged_for_recheck", { reason: "The event date or time changed" })).toBe(
      "The event date or time changed",
    );
  });

  it("recognises the stored actions", () => {
    expect(isEquipmentReservationAction("released")).toBe(true);
    expect(isEquipmentReservationAction("deleted")).toBe(false);
  });
});
