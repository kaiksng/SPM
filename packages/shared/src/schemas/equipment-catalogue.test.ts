import { describe, expect, it } from "vitest";

import {
  equipmentInitialUnitsSchema,
  equipmentItemSchema,
  equipmentUnitCountSchema,
  equipmentUnitLabel,
} from "./equipment-catalogue";

describe("equipment catalogue item", () => {
  it("trims the name and lowercases the code", () => {
    expect(
      equipmentItemSchema.parse({ name: "  Fog machine ", category: "Lighting", code: " FOG " }),
    ).toEqual({ name: "Fog machine", category: "Lighting", code: "fog" });
  });

  it.each(["fog machine", "fog--1", "-fog", "fog_1", ""])("rejects code %j", (code) => {
    expect(equipmentItemSchema.safeParse({ name: "Fog", category: "Lighting", code }).success).toBe(false);
  });

  it("requires a name and a category", () => {
    const result = equipmentItemSchema.safeParse({ name: " ", category: "", code: "fog" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(["name", "category"]);
  });
});

describe("equipment unit counts", () => {
  it.each([["1", true], ["04", true], ["1000", true], ["0", false], ["1001", false], ["1.5", false]])(
    "adding %s units is valid: %s",
    (value, expected) => {
      expect(equipmentUnitCountSchema.safeParse(value).success).toBe(expected);
    },
  );

  it("allows a new item to start with no units", () => {
    expect(equipmentInitialUnitsSchema.safeParse("0").success).toBe(true);
    expect(equipmentInitialUnitsSchema.safeParse("1001").success).toBe(false);
  });

  it("labels a unit with its item code", () => {
    expect(equipmentUnitLabel("mic", 3)).toBe("mic-3");
  });
});
