import { describe, expect, it } from "vitest";

import { getRoleDestination } from "./role-destination";

describe("role destination", () => {
  it.each([
    ["event_organiser", "/events"],
    ["event_coordinator", "/events"],
    ["venue_staff", "/venues"],
    ["technical_support_staff", "/equipment"],
    ["attendee", "/browse-events"],
  ] as const)("routes %s to %s, the first section in their own nav", (role, destination) => {
    expect(getRoleDestination(role)).toBe(destination);
  });
});
