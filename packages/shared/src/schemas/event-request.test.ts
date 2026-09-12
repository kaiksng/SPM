import { describe, expect, it } from "vitest";

import {
  emptyEventRequestFormValues,
  eventDraftSchema,
  toEventDraftPayload,
} from "./event-request";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyEventRequestFormValues,
    venue: { ...emptyEventRequestFormValues.venue },
    registration: { ...emptyEventRequestFormValues.registration },
    equipment: [],
    title: "Orientation briefing",
    ...overrides,
  };
}

describe("event draft validation", () => {
  it.each([
    ["ab", false],
    ["abc", true],
    ["a".repeat(160), true],
    ["a".repeat(161), false],
  ])("validates the event name boundary", (title, expected) => {
    expect(eventDraftSchema.safeParse(draft({ title })).success).toBe(expected);
  });

  it.each([
    ["", true],
    ["0", false],
    ["1", true],
    ["1.5", false],
  ])("validates optional attendance value %s", (expectedAttendance, expected) => {
    expect(
      eventDraftSchema.safeParse(draft({ expectedAttendance })).success,
    ).toBe(expected);
  });

  it("rejects an end time equal to or before the start time", () => {
    for (const endsAt of ["2026-09-25T09:59", "2026-09-25T10:00"]) {
      expect(
        eventDraftSchema.safeParse(
          draft({ startsAt: "2026-09-25T10:00", endsAt }),
        ).success,
      ).toBe(false);
    }
  });

  it("accepts an empty or later end time", () => {
    for (const endsAt of ["", "2026-09-25T10:01"]) {
      expect(
        eventDraftSchema.safeParse(
          draft({ startsAt: "2026-09-25T10:00", endsAt }),
        ).success,
      ).toBe(true);
    }
  });

  it("requires valid equipment rows and unique facilities", () => {
    const result = eventDraftSchema.safeParse(
      draft({
        venue: {
          ...emptyEventRequestFormValues.venue,
          facilities: ["Projector", "projector"],
        },
        equipment: [{ equipmentName: "", quantity: "0", notes: "" }],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("normalises dates and blanks for persistence", () => {
    const parsed = eventDraftSchema.parse(
      draft({
        purpose: "  Student welcome  ",
        startsAt: "2026-09-25T10:00",
      }),
    );
    const payload = toEventDraftPayload(parsed);

    expect(payload.purpose).toBe("Student welcome");
    expect(payload.description).toBeNull();
    expect(payload.startsAt).toMatch(/^2026-09-25T/);
  });
});
