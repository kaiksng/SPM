import { describe, expect, it } from "vitest";

import { equipmentPlacementSchema, venueSafetyChecksSchema } from "./safety-plan";

const checks = {
  emergencyAccessChecked: true,
  emergencyAccess: "  Exits B and C  ",
  restrictionsChecked: true,
  restrictions: "",
  crowdMovementChecked: false,
  crowdMovementPlan: "",
};

describe("venueSafetyChecksSchema (SPM-90)", () => {
  it("accepts the ticks with optional, trimmed details", () => {
    expect(venueSafetyChecksSchema.parse(checks)).toEqual({ ...checks, emergencyAccess: "Exits B and C" });
  });

  it("refuses details over 2,000 characters", () => {
    const result = venueSafetyChecksSchema.safeParse({ ...checks, restrictions: "x".repeat(2001) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Known restrictions must contain at most 2,000 characters");
  });
});

describe("equipmentPlacementSchema (SPM-90)", () => {
  it("accepts open text, trimmed, and blank while planning", () => {
    expect(equipmentPlacementSchema.parse({ equipmentPlacement: " Stage left " })).toEqual({ equipmentPlacement: "Stage left" });
    expect(equipmentPlacementSchema.safeParse({ equipmentPlacement: "" }).success).toBe(true);
  });

  it("refuses more than 2,000 characters", () => {
    const result = equipmentPlacementSchema.safeParse({ equipmentPlacement: "x".repeat(2001) });
    expect(result.error?.issues[0]?.message).toBe("Equipment placement must contain at most 2,000 characters");
  });
});
