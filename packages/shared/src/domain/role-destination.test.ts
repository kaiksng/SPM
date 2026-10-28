import { describe, expect, it } from "vitest";

import { getRoleDestination } from "./role-destination";

describe("role destination", () => {
  it.each([
    ["event_organiser", "/events"],
    ["event_coordinator", "/events"],
    ["venue_staff", "/venue-requests"],
    ["technical_support_staff", "/equipment"],
    ["attendee", "/browse-events"],
  ] as const)("routes %s to %s, the first section in their own nav", (role, destination) => {
    expect(getRoleDestination(role)).toBe(destination);
  });

  // SPM-77 AC01: the Lead and the Safety Officer each land on their own page.
  it.each([
    ["event_coordinator_lead", "/events"],
    ["safety_officer", "/safety-checks"],
  ] as const)("routes %s to %s, their own landing page", (role, destination) => {
    expect(getRoleDestination(role)).toBe(destination);
  });
});
