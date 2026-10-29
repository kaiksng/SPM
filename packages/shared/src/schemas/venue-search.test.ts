import { describe, expect, it } from "vitest";

import { venueSearchSchema } from "./venue-search";

const valid = {
  startsAt: "2099-04-06T10:00",
  endsAt: "2099-04-06T12:00",
  minimumCapacity: "40",
  location: "",
  layout: "",
  facilities: [] as string[],
  accessibility: "",
};

function issuesFor(overrides: Partial<typeof valid>) {
  const result = venueSearchSchema.safeParse({ ...valid, ...overrides });
  return result.success ? [] : result.error.issues.map((issue) => ({ path: issue.path[0], message: issue.message }));
}

describe("venueSearchSchema", () => {
  // SPM-21 AC: unspecified optional filters do not restrict results.
  it("accepts a period and capacity with every optional filter left blank", () => {
    expect(venueSearchSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts every filter when specified", () => {
    const result = venueSearchSchema.safeParse({
      ...valid,
      location: "Bugis",
      layout: "Theatre",
      facilities: ["Projector", "Microphone"],
      accessibility: "wheelchair",
    });
    expect(result.success).toBe(true);
  });

  // SPM-21 AC: a valid start/end period is required.
  describe("period", () => {
    it("requires a start and an end", () => {
      expect(issuesFor({ startsAt: "", endsAt: "" })).toEqual([
        { path: "startsAt", message: "Enter a start date and time" },
        { path: "endsAt", message: "Enter an end date and time" },
      ]);
    });

    it("rejects a malformed or impossible date and time", () => {
      expect(issuesFor({ startsAt: "tomorrow" })).toContainEqual({ path: "startsAt", message: "Enter a valid date and time" });
      expect(issuesFor({ endsAt: "2099-02-31T10:00" })).toContainEqual({ path: "endsAt", message: "Enter a valid date and time" });
    });

    it("rejects an end that equals or precedes the start, and accepts one minute later", () => {
      expect(issuesFor({ endsAt: valid.startsAt })).toContainEqual({ path: "endsAt", message: "End time must be after start time" });
      expect(issuesFor({ endsAt: "2099-04-06T09:00" })).toContainEqual({ path: "endsAt", message: "End time must be after start time" });
      expect(issuesFor({ endsAt: "2099-04-06T10:01" })).toEqual([]);
    });
  });

  // SPM-21 AC: a positive capacity is required.
  describe("minimum capacity", () => {
    it.each(["", "0", "-5", "1.5", "abc", "007"])("rejects %j", (minimumCapacity) => {
      expect(issuesFor({ minimumCapacity })).toContainEqual({
        path: "minimumCapacity",
        message: "Enter a positive minimum capacity",
      });
    });

    it("accepts 1 and the largest supported value, and rejects one above it", () => {
      expect(issuesFor({ minimumCapacity: "1" })).toEqual([]);
      expect(issuesFor({ minimumCapacity: "2147483647" })).toEqual([]);
      expect(issuesFor({ minimumCapacity: "2147483648" })).toContainEqual({
        path: "minimumCapacity",
        message: "Capacity is too large",
      });
    });
  });

  describe("optional filters", () => {
    it("rejects an over-long layout and blank facility names", () => {
      expect(issuesFor({ layout: "x".repeat(121) })).toContainEqual(expect.objectContaining({ path: "layout" }));
      expect(issuesFor({ layout: "x".repeat(120) })).toEqual([]);
      expect(issuesFor({ facilities: ["Projector", "   "] })).toContainEqual(expect.objectContaining({ path: "facilities" }));
    });
  });
});
