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

  // Requests comes first, so venue staff land on it after signing in.
  it("gives venue staff the booking requests, venues, and flagged bookings sections", () => {
    expect(getNavItemsForRole("venue_staff").map((item) => item.id)).toEqual([
      "requests",
      "venues",
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

  it("gives attendees the browse events and my registrations sections", () => {
    expect(getNavItemsForRole("attendee").map((item) => item.id)).toEqual([
      "browse-events",
      "my-registrations",
    ]);
  });

  it("scopes 'my registrations' as its own section, not part of browse events", () => {
    expect(isPathAllowedForRole("/browse-events/my-registrations", "attendee")).toBe(true);
    expect(isPathAllowedForRole("/browse-events/some-event-id", "attendee")).toBe(true);
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

  // SPM-77 AC02: the Lead's permitted pages.
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
    // View Event Registration Information: the Lead sees every event's registrations.
    expect(
      isPathAllowedForRole(
        "/events/10000000-0000-0000-0000-000000000001/registrations",
        "event_coordinator_lead",
      ),
    ).toBe(true);
  });

  // SPM-77 AC02: the Lead cannot reach event editing, venue or creation routes.
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

  describe("SPM-16: venue staff role scope", () => {
    const eventId = "10000000-0000-0000-0000-000000000001";
    const venueId = "30000000-0000-0000-0000-000000000003";

    // SPM-16 AC01: venue staff reach every venue section their role needs.
    it.each([
      "/venues",
      `/venues/${venueId}`,
      `/venues/${venueId}/blocks`,
      "/venue-requests",
      "/flagged-bookings",
    ])("allows venue staff to reach %s", (path) => {
      expect(isPathAllowedForRole(path, "venue_staff")).toBe(true);
    });

    // SPM-16 AC02: event planning, equipment, attendee and safety areas are
    // outside venue staff's scope.
    it.each([
      "/events",
      "/events/new",
      `/events/${eventId}`,
      `/events/${eventId}/edit`,
      `/events/${eventId}/history`,
      `/events/${eventId}/venue`,
      "/equipment",
      "/equipment/inventory",
      "/equipment/unavailability",
      "/browse-events",
      "/safety-checks",
    ])("blocks venue staff from %s", (path) => {
      expect(isPathAllowedForRole(path, "venue_staff")).toBe(false);
    });

    // SPM-16 AC02: an unknown path is denied rather than allowed by default.
    it("blocks venue staff from a path that belongs to no section", () => {
      expect(isPathAllowedForRole("/admin", "venue_staff")).toBe(false);
    });
  });

  describe("SPM-48: technical support staff role scope", () => {
    const eventId = "10000000-0000-0000-0000-000000000001";
    const venueId = "30000000-0000-0000-0000-000000000003";

    // SPM-48 AC01: technical support staff reach every equipment section their role needs.
    it.each(["/equipment", "/equipment/inventory", "/equipment/unavailability"])(
      "allows technical support staff to reach %s",
      (path) => {
        expect(isPathAllowedForRole(path, "technical_support_staff")).toBe(true);
      },
    );

    // SPM-48 AC02: event planning, venue, attendee and safety areas are
    // outside technical support staff's scope.
    it.each([
      "/events",
      "/events/new",
      `/events/${eventId}`,
      `/events/${eventId}/edit`,
      `/events/${eventId}/history`,
      `/events/${eventId}/venue`,
      `/events/${eventId}/equipment`,
      "/venues",
      `/venues/${venueId}`,
      "/venue-requests",
      "/flagged-bookings",
      "/browse-events",
      "/safety-checks",
    ])("blocks technical support staff from %s", (path) => {
      expect(isPathAllowedForRole(path, "technical_support_staff")).toBe(false);
    });

    // SPM-48 AC02: an unknown path is denied rather than allowed by default.
    it("blocks technical support staff from a path that belongs to no section", () => {
      expect(isPathAllowedForRole("/admin", "technical_support_staff")).toBe(false);
    });
  });

  describe("SPM-49: attendee role scope", () => {
    const eventId = "10000000-0000-0000-0000-000000000001";

    // SPM-49 AC01: an attendee reaches the attendee-facing events page.
    it("allows an attendee to reach Browse Events", () => {
      expect(isPathAllowedForRole("/browse-events", "attendee")).toBe(true);
    });

    // SPM-49 AC02/AC03: internal planning pages are denied, even by direct address.
    it.each([
      "/events",
      "/events/new",
      `/events/${eventId}`,
      `/events/${eventId}/edit`,
      `/events/${eventId}/history`,
      `/events/${eventId}/venue`,
      `/events/${eventId}/equipment`,
      "/venues",
      "/venue-requests",
      "/flagged-bookings",
      "/equipment",
      "/equipment/inventory",
      "/safety-checks",
      "/admin",
    ])("blocks an attendee from %s", (path) => {
      expect(isPathAllowedForRole(path, "attendee")).toBe(false);
    });
  });

  describe("SPM-77: event coordinator lead and safety officer role scope", () => {
    const eventId = "10000000-0000-0000-0000-000000000001";

    // SPM-77 AC02: the Lead's permitted pages are the events dashboard,
    // a read-only event detail and its history.
    it.each([
      "/events",
      `/events/${eventId}`,
      `/events/${eventId}/history`,
      `/events/${eventId}/registrations`,
    ])("allows the lead to reach %s", (path) => {
      expect(isPathAllowedForRole(path, "event_coordinator_lead")).toBe(true);
    });

    // SPM-77 AC02: everything else is outside the Lead's scope.
    it.each([
      `/events/${eventId}/equipment`,
      "/venues",
      "/venue-requests",
      "/flagged-bookings",
      "/equipment",
      "/equipment/inventory",
      "/browse-events",
      "/safety-checks",
      "/admin",
    ])("blocks the lead from %s", (path) => {
      expect(isPathAllowedForRole(path, "event_coordinator_lead")).toBe(false);
    });

    // This story: a Safety Officer reaches an event's history page from
    // their review screen, but gets none of the rest of "/events/*".
    it.each([`/events/${eventId}`, "/events", "/events/new"])(
      "blocks the safety officer from %s",
      (path) => {
        expect(isPathAllowedForRole(path, "safety_officer")).toBe(false);
      },
    );

    // SPM-77 AC03: everything except Safety Checks (and event history) is
    // outside the Safety Officer's scope.
    it.each([
      "/venue-requests",
      "/flagged-bookings",
      "/equipment",
      "/equipment/inventory",
      "/browse-events",
      "/admin",
    ])("blocks the safety officer from %s", (path) => {
      expect(isPathAllowedForRole(path, "safety_officer")).toBe(false);
    });

    // This story: the Safety Officer can open an event's change history
    // from their review screen.
    it("allows the safety officer to reach an event's history page", () => {
      expect(isPathAllowedForRole(`/events/${eventId}/history`, "safety_officer")).toBe(true);
    });
  });

  // SPM-77 AC03: the Safety Officer's only section is Safety Checks.
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
