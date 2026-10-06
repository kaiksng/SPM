import { describe, expect, it } from "vitest";

import {
  equipmentShortage,
  isEquipmentAvailabilityStatus,
  overallEquipmentAvailability,
} from "./equipment-availability";

describe("equipment availability", () => {
  it("states the shortage when fewer can be provided than requested", () => {
    expect(equipmentShortage({ status: "partially_available", requestedQuantity: 80, availableQuantity: 60 })).toBe(20);
    expect(equipmentShortage({ status: "unavailable", requestedQuantity: 3, availableQuantity: 0 })).toBe(3);
    expect(equipmentShortage({ status: "available", requestedQuantity: 3, availableQuantity: 60 })).toBe(0);
  });

  it("gives no shortage for unknown equipment", () => {
    expect(equipmentShortage({ status: "unknown", requestedQuantity: 1, availableQuantity: 0 })).toBeNull();
  });

  it("rates an event by its worst item", () => {
    expect(overallEquipmentAvailability(["available", "available"])).toBe("available");
    expect(overallEquipmentAvailability(["available", "partially_available"])).toBe("partially_available");
    expect(overallEquipmentAvailability(["partially_available", "unavailable"])).toBe("unavailable");
    expect(overallEquipmentAvailability(["unavailable", "unknown"])).toBe("unknown");
    expect(overallEquipmentAvailability([])).toBeNull();
  });

  it("recognises the statuses the database returns", () => {
    expect(isEquipmentAvailabilityStatus("partially_available")).toBe(true);
    expect(isEquipmentAvailabilityStatus("maybe")).toBe(false);
  });
});
