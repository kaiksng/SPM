import { describe, expect, it } from "vitest";

import { venueBookingDetailsSchema } from "./venue-booking";

const valid = {
  label: "Breakout 1",
  startsAt: "2099-04-06T10:00:00+08:00",
  endsAt: "2099-04-06T11:30:00+08:00",
  expectedHeadcount: 40,
};

describe("venueBookingDetailsSchema", () => {
  it("SPM-85 AC09: accepts a label, period and headcount with optional needs", () => {
    expect(venueBookingDetailsSchema.safeParse(valid).success).toBe(true);
    expect(venueBookingDetailsSchema.safeParse({
      ...valid, layoutNotes: "Classroom", accessibilityNotes: "Ramp", requiredFacilities: ["Whiteboard"],
    }).success).toBe(true);
  });

  it("SPM-85 AC09: requires a label", () => {
    const result = venueBookingDetailsSchema.safeParse({ ...valid, label: "   " });
    expect(result.error?.issues[0]?.message).toBe("Give this booking a label, for example Breakout 1");
  });

  it("SPM-85 AC09: requires a positive whole headcount", () => {
    expect(venueBookingDetailsSchema.safeParse({ ...valid, expectedHeadcount: 0 }).success).toBe(false);
    expect(venueBookingDetailsSchema.safeParse({ ...valid, expectedHeadcount: 12.5 }).success).toBe(false);
    expect(venueBookingDetailsSchema.safeParse({ ...valid, expectedHeadcount: undefined }).success).toBe(false);
  });

  it("SPM-85 AC03: rejects an end that is not after the start", () => {
    const result = venueBookingDetailsSchema.safeParse({ ...valid, endsAt: valid.startsAt });
    expect(result.error?.issues[0]?.message).toBe("End time must be after start time");
  });

  it("SPM-85 AC03: rejects a period that is not a real date and time", () => {
    expect(venueBookingDetailsSchema.safeParse({ ...valid, startsAt: "tomorrow" }).success).toBe(false);
  });
});
