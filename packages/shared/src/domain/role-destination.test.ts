import { describe, expect, it } from "vitest";

import { getRoleDestination } from "./role-destination";

describe("role destination", () => {
  const roles = [
    "event_organiser",
    "event_coordinator",
    "venue_staff",
    "technical_support_staff",
    "attendee",
    "administrator",
  ] as const;

  it.each(roles)("routes %s to the shared landing page for now", (role) => {
    expect(getRoleDestination(role)).toBe("/home");
  });
});
