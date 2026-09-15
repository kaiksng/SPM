import { describe, expect, it } from "vitest";

import {
  eventFieldHistoryKeys,
  eventFieldHistoryLabel,
  eventFieldHistoryLabels,
  isEventFieldHistoryBooleanField,
  isEventFieldHistoryDateField,
} from "./event-field-history";

describe("event field history keys", () => {
  it("defines a label for every field key", () => {
    expect(Object.keys(eventFieldHistoryLabels).sort()).toEqual(
      [...eventFieldHistoryKeys].sort(),
    );
  });

  it("has no duplicate keys", () => {
    expect(new Set(eventFieldHistoryKeys).size).toBe(eventFieldHistoryKeys.length);
  });
});

describe("eventFieldHistoryLabel", () => {
  it("returns the human label for a known field", () => {
    expect(eventFieldHistoryLabel("expectedAttendance")).toBe("Expected attendance");
    expect(eventFieldHistoryLabel("venue.preferredLocation")).toBe("Preferred location");
  });

  it("falls back to the raw field name for an unknown field", () => {
    expect(eventFieldHistoryLabel("somethingUnexpected")).toBe("somethingUnexpected");
  });
});

describe("isEventFieldHistoryDateField", () => {
  it("treats schedule and registration window fields as dates", () => {
    expect(isEventFieldHistoryDateField("startsAt")).toBe(true);
    expect(isEventFieldHistoryDateField("registration.opensAt")).toBe(true);
  });

  it("treats other fields as not dates", () => {
    expect(isEventFieldHistoryDateField("title")).toBe(false);
  });
});

describe("isEventFieldHistoryBooleanField", () => {
  it("treats registration toggles as booleans", () => {
    expect(isEventFieldHistoryBooleanField("registration.required")).toBe(true);
    expect(isEventFieldHistoryBooleanField("registration.waitlistEnabled")).toBe(true);
  });

  it("treats other fields as not booleans", () => {
    expect(isEventFieldHistoryBooleanField("expectedAttendance")).toBe(false);
  });
});
