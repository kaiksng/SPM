import { describe, expect, it } from "vitest";

import { equipmentArrangementSchema } from "./equipment-arrangement";

describe("equipmentArrangementSchema", () => {
  it("accepts a status with or without a note", () => {
    expect(equipmentArrangementSchema.safeParse({ status: "issue", note: "" }).success).toBe(true);
    expect(equipmentArrangementSchema.parse({ status: "arranged", note: "  Delivered  " })).toEqual({
      status: "arranged",
      note: "Delivered",
    });
  });

  // AC01: only the fixed list.
  it("refuses a status outside the list", () => {
    const result = equipmentArrangementSchema.safeParse({ status: "reserved", note: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toMatchObject({ path: ["status"], message: "Choose an arrangement status" });
  });

  it("allows a note of up to 1000 characters", () => {
    expect(equipmentArrangementSchema.safeParse({ status: "in_progress", note: "a".repeat(1000) }).success).toBe(true);
    const result = equipmentArrangementSchema.safeParse({ status: "in_progress", note: "a".repeat(1001) });
    expect(result.error?.issues[0]).toMatchObject({
      path: ["note"],
      message: "Note must contain at most 1000 characters",
    });
  });
});
