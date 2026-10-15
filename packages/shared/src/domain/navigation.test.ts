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

  it("gives venue staff the venues, booking requests, and flagged bookings sections", () => {
    expect(getNavItemsForRole("venue_staff").map((item) => item.id)).toEqual([
      "venues",
      "requests",
      "flagged-bookings",
    ]);
  });

  it("gives technical support staff event requests, inventory and unavailability", () => {
    expect(
      getNavItemsForRole("technical_support_staff").map((item) => [item.label, item.href]),
    ).toEqual([
      ["Event requests", "/equipment"],
      ["Inventory", "/equipment/inventory"],
      ["Unavailability", "/equipment/unavailability"],
    ]);
  });

  it("keeps inventory and unavailability to technical support staff", () => {
    for (const path of ["/equipment", "/equipment/inventory", "/equipment/unavailability"]) {
      expect(isPathAllowedForRole(path, "technical_support_staff")).toBe(true);
    }
    expect(isPathAllowedForRole("/equipment", "event_coordinator")).toBe(true);
    expect(isPathAllowedForRole("/equipment/inventory", "event_coordinator")).toBe(false);
    expect(isPathAllowedForRole("/equipment/unavailability", "event_organiser")).toBe(false);
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

  it("gives the event coordinator lead the events dashboard, read-only detail, and history page", () => {
    expect(isPathAllowedForRole("/events", "event_coordinator_lead")).toBe(true);
    expect(
      isPathAllowedForRole(
        "/events/10000000-0000-0000-0000-000000000001",
        "event_coordinator_lead",
      ),
    ).toBe(true);
    expect(
      isPathAllowedForRole(
        "/events/10000000-0000-0000-0000-000000000001/history",
        "event_coordinator_lead",
      ),
    ).toBe(true);
  });

  it("blocks the event coordinator lead from an event's venue and edit routes, and from creating one", () => {
    const eventId = "10000000-0000-0000-0000-000000000001";
    expect(isPathAllowedForRole("/events/new", "event_coordinator_lead")).toBe(false);
    expect(
      isPathAllowedForRole(`/events/${eventId}/venue`, "event_coordinator_lead"),
    ).toBe(false);
    expect(
      isPathAllowedForRole(`/events/${eventId}/edit`, "event_coordinator_lead"),
    ).toBe(false);
    expect(
      isPathAllowedForRole(`/events/${eventId}/submit`, "event_coordinator_lead"),
    ).toBe(false);
    expect(
      isPathAllowedForRole(
        `/events/${eventId}/coordinator-edit`,
        "event_coordinator_lead",
      ),
    ).toBe(false);
  });

  it("gives the safety officer only the safety checks section", () => {
    expect(
      getNavItemsForRole("safety_officer").map((item) => item.id),
    ).toEqual(["safety-checks"]);
  });

  it("blocks the safety officer from events and other sections", () => {
    expect(isPathAllowedForRole("/safety-checks", "safety_officer")).toBe(true);
    expect(isPathAllowedForRole("/events", "safety_officer")).toBe(false);
    expect(isPathAllowedForRole("/venues", "safety_officer")).toBe(false);
  });
});
