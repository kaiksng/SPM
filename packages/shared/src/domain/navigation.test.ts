import { describe, expect, it } from "vitest";

import { getNavItemsForRole, isPathAllowedForRole } from "./navigation";

describe("workspace navigation", () => {
  it("gives organisers events, venues, and equipment — view-only for the latter two", () => {
    expect(
      getNavItemsForRole("event_organiser").map((item) => item.id),
    ).toEqual(["events", "venues", "equipment"]);
  });

  it("gives coordinators every staff-facing section", () => {
    expect(
      getNavItemsForRole("event_coordinator").map((item) => item.id),
    ).toEqual(["events", "venues", "equipment"]);
  });

  it("gives venue staff the venues section", () => {
    expect(getNavItemsForRole("venue_staff").map((item) => item.id)).toEqual([
      "venues",
    ]);
  });

  it("gives technical support staff the equipment section", () => {
    expect(
      getNavItemsForRole("technical_support_staff").map((item) => item.id),
    ).toEqual(["equipment"]);
  });

  it("gives attendees only the browse events section", () => {
    expect(getNavItemsForRole("attendee").map((item) => item.id)).toEqual([
      "browse-events",
    ]);
  });

  it("allows a role to reach a path that appears in its own nav", () => {
    expect(isPathAllowedForRole("/venues", "venue_staff")).toBe(true);
  });

  it("allows an organiser to reach nested event-request routes", () => {
    expect(isPathAllowedForRole("/events/new", "event_organiser")).toBe(true);
    expect(
      isPathAllowedForRole(
        "/events/10000000-0000-0000-0000-000000000001/edit",
        "event_organiser",
      ),
    ).toBe(true);
  });

  it("blocks a role from a path outside its nav", () => {
    expect(isPathAllowedForRole("/equipment", "venue_staff")).toBe(false);
  });
});
