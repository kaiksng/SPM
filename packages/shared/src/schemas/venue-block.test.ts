import { describe, expect, it } from "vitest";

import { isoToSingaporeLocal, singaporeLocalToIso, venueBlockSchema } from "./venue-block";
import { venueSearchSchema } from "./venue-search";

const venueId = "f3000000-0000-4000-8000-000000000010";

describe("venue block and search inputs", () => {
  it("keeps Singapore local times stable regardless of browser timezone", () => {
    expect(singaporeLocalToIso("2099-04-06T10:30")).toBe("2099-04-06T02:30:00.000Z");
    expect(isoToSingaporeLocal("2099-04-06T02:30:00.000Z")).toBe("2099-04-06T10:30");
  });

  it("identifies blank reasons and reversed periods", () => {
    const result = venueBlockSchema.safeParse({
      venueId, reason: "  ", startsAt: "2099-04-06T12:00", endsAt: "2099-04-06T10:00",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["reason", "endsAt"]));
  });

  it("requires dates and capacity for manual search", () => {
    const result = venueSearchSchema.safeParse({
      startsAt: "", endsAt: "", minimumCapacity: "0",
      location: "", layout: "", facilities: [], accessibility: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["startsAt", "endsAt", "minimumCapacity"]));
  });
});
