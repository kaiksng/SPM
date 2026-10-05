import { describe, expect, it } from "vitest";

import {
  changedEquipmentFields,
  isEquipmentChangeType,
  parseEquipmentSnapshot,
  type EquipmentSnapshot,
} from "./equipment-history";

const snapshot: EquipmentSnapshot = {
  equipmentItemId: "item-1",
  equipmentName: "Wireless microphone",
  category: "Audio",
  quantity: 2,
  requiredFrom: "2099-04-01T01:00:00Z",
  requiredUntil: "2099-04-01T06:00:00Z",
  technicalRequirements: null,
};

describe("equipment history", () => {
  it("parses a stored snapshot", () => {
    expect(parseEquipmentSnapshot({ ...snapshot })).toEqual(snapshot);
  });

  it("treats a missing or malformed snapshot as absent", () => {
    expect(parseEquipmentSnapshot(null)).toBeNull();
    expect(parseEquipmentSnapshot([])).toBeNull();
    expect(parseEquipmentSnapshot({ quantity: 1 })).toBeNull();
  });

  it("reads a legacy snapshot without a catalogue item or period", () => {
    expect(
      parseEquipmentSnapshot({
        equipmentItemId: null,
        equipmentName: "Old projector",
        category: null,
        quantity: 1,
        requiredFrom: null,
        requiredUntil: null,
        technicalRequirements: "HDMI",
      }),
    ).toMatchObject({ equipmentItemId: null, requiredFrom: null, technicalRequirements: "HDMI" });
  });

  it("lists only the fields that changed, in display order", () => {
    expect(
      changedEquipmentFields(snapshot, {
        ...snapshot,
        requiredUntil: "2099-04-01T07:00:00Z",
        quantity: 3,
      }),
    ).toEqual(["quantity", "requiredUntil"]);
    expect(changedEquipmentFields(snapshot, { ...snapshot })).toEqual([]);
  });

  it("recognises the stored change types", () => {
    expect(isEquipmentChangeType("added")).toBe(true);
    expect(isEquipmentChangeType("deleted")).toBe(false);
  });
});
