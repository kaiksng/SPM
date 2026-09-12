import { describe, expect, it } from "vitest";

import { getNavItemsForRole, isPathAllowedForRole } from "./navigation";

describe("workspace navigation", () => {
  it("gives organisers the dashboard and events sections", () => {
    expect(
      getNavItemsForRole("event_organiser").map((item) => item.id),
    ).toEqual(["dashboard", "events"]);
  });

  it("gives coordinators every staff-facing section", () => {
    expect(
      getNavItemsForRole("event_coordinator").map((item) => item.id),
    ).toEqual(["dashboard", "events", "venues", "equipment"]);
  });

  it("gives venue staff the dashboard and venues sections", () => {
    expect(getNavItemsForRole("venue_staff").map((item) => item.id)).toEqual([
      "dashboard",
      "venues",
    ]);
  });

  it("gives technical support staff the dashboard and equipment sections", () => {
    expect(
      getNavItemsForRole("technical_support_staff").map((item) => item.id),
    ).toEqual(["dashboard", "equipment"]);
  });

  it("gives attendees only the browse events section", () => {
    expect(getNavItemsForRole("attendee").map((item) => item.id)).toEqual([
      "browse-events",
    ]);
  });

  it("gives administrators every staff-facing section", () => {
    expect(getNavItemsForRole("administrator").map((item) => item.id)).toEqual([
      "dashboard",
      "events",
      "venues",
      "equipment",
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
    expect(isPathAllowedForRole("/venues", "event_organiser")).toBe(false);
  });

  it("blocks a role from the dashboard when it has no dashboard nav item", () => {
    // Attendees still land on /home after login (see role-destination.ts) even
    // though it isn't in their menu, so pages must not gate /home with this.
    expect(isPathAllowedForRole("/home", "attendee")).toBe(false);
  });
});
