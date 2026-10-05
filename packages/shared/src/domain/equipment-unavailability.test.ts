import { describe, expect, it } from "vitest";

import { equipmentUnavailabilitySchema, equipmentStockSchema } from "../schemas/equipment-unavailability";
import {
  canEndEquipmentUnavailability,
  canRemoveEquipmentUnavailability,
  effectiveUnavailabilityEnd,
  equipmentUnavailabilityStatus,
  periodsOverlap,
} from "./equipment-unavailability";

const now = new Date("2099-04-10T04:00:00Z");
const record = (overrides: Record<string, string | null> = {}) => ({
  startsAt: "2099-04-10T00:00:00Z",
  endsAt: "2099-04-12T00:00:00Z",
  endedAt: null,
  removedAt: null,
  ...overrides,
});

describe("equipment unavailability status", () => {
  it.each([
    [record(), "in_progress"],
    [record({ startsAt: "2099-04-11T00:00:00Z" }), "upcoming"],
    [record({ endsAt: "2099-04-10T01:00:00Z" }), "past"],
    [record({ endedAt: "2099-04-10T02:00:00Z" }), "ended_early"],
    [record({ removedAt: "2099-04-10T02:00:00Z" }), "removed"],
  ])("derives the status of %o", (input, expected) => {
    expect(equipmentUnavailabilityStatus(input, now)).toBe(expected);
  });

  it("only allows ending while in progress, and removing before it is over", () => {
    expect(canEndEquipmentUnavailability("in_progress")).toBe(true);
    expect(canEndEquipmentUnavailability("upcoming")).toBe(false);
    expect(canRemoveEquipmentUnavailability("upcoming")).toBe(true);
    expect(canRemoveEquipmentUnavailability("in_progress")).toBe(true);
    expect(canRemoveEquipmentUnavailability("past")).toBe(false);
    expect(canRemoveEquipmentUnavailability("removed")).toBe(false);
  });

  it("counts an early return as the effective end", () => {
    expect(effectiveUnavailabilityEnd(record({ endedAt: "2099-04-10T02:00:00Z" }))).toBe(
      "2099-04-10T02:00:00Z",
    );
    expect(effectiveUnavailabilityEnd(record())).toBe("2099-04-12T00:00:00Z");
  });

  it("treats periods that only touch as not overlapping", () => {
    const first = { startsAt: "2099-04-10T00:00:00Z", endsAt: "2099-04-10T10:00:00Z" };
    expect(periodsOverlap(first, { startsAt: "2099-04-10T10:00:00Z", endsAt: "2099-04-10T12:00:00Z" })).toBe(false);
    expect(periodsOverlap(first, { startsAt: "2099-04-10T09:00:00Z", endsAt: "2099-04-10T12:00:00Z" })).toBe(true);
  });
});

describe("equipment unavailability form", () => {
  const valid = {
    equipmentItemId: "11111111-1111-1111-1111-111111111111",
    quantity: "2",
    reason: "Lamp replacement",
    startsAt: "2099-04-10T09:00",
    endsAt: "2099-04-10T17:00",
  };

  function errors(overrides: Record<string, string>) {
    const result = equipmentUnavailabilitySchema.safeParse({ ...valid, ...overrides });
    const messages: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) messages[issue.path.join(".")] ??= issue.message;
    }
    return messages;
  }

  it("accepts a complete record", () => {
    expect(errors({})).toEqual({});
  });

  it("identifies each missing field", () => {
    expect(errors({ equipmentItemId: "", quantity: "", reason: " ", startsAt: "", endsAt: "" })).toEqual({
      equipmentItemId: "Choose equipment from the catalogue",
      quantity: "Enter a quantity",
      reason: "Enter a reason",
      startsAt: "Enter a date and time",
      endsAt: "Enter a date and time",
    });
  });

  it.each(["0", "-1", "1.5"])("rejects quantity %s", (quantity) => {
    expect(errors({ quantity })).toEqual({ quantity: "Enter a positive whole number" });
  });

  it("requires the end to be after the start", () => {
    expect(errors({ endsAt: "2099-04-10T09:00" })).toEqual({
      endsAt: "End time must be after start time",
    });
  });

  it("accepts a quantity typed with a leading zero", () => {
    expect(errors({ quantity: "04" })).toEqual({});
    expect(errors({ quantity: "00" })).toEqual({ quantity: "Enter a positive whole number" });
  });

  it("accepts zero stock but not negative or fractional stock", () => {
    expect(equipmentStockSchema.safeParse("04").success).toBe(true);
    expect(equipmentStockSchema.safeParse("0").success).toBe(true);
    expect(equipmentStockSchema.safeParse("12").success).toBe(true);
    expect(equipmentStockSchema.safeParse("-1").success).toBe(false);
    expect(equipmentStockSchema.safeParse("1.5").success).toBe(false);
  });
});
