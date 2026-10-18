import { describe, expect, it } from "vitest";

import { hasPermission } from "./permissions";

describe("role permissions", () => {
  it("allows organisers to create events", () => {
    expect(hasPermission("event_organiser", "createEvent")).toBe(true);
  });

  it("prevents attendees from reviewing events", () => {
    expect(hasPermission("attendee", "reviewEvent")).toBe(false);
  });

  // SPM-16 AC01: venue staff may manage venues and decide booking requests.
  it.each(["manageVenue", "decideVenueBooking"] as const)(
    "allows venue staff to %s",
    (permission) => {
      expect(hasPermission("venue_staff", permission)).toBe(true);
    },
  );

  // SPM-49 AC01: an attendee may register for events.
  it("allows an attendee to registerForEvent", () => {
    expect(hasPermission("attendee", "registerForEvent")).toBe(true);
  });

  // SPM-49 AC02: an attendee gets no internal planning actions.
  it.each([
    "createEvent",
    "reviewEvent",
    "manageVenue",
    "decideVenueBooking",
    "reserveEquipment",
  ] as const)("prevents an attendee from %s", (permission) => {
    expect(hasPermission("attendee", permission)).toBe(false);
  });

  // SPM-48 AC01: technical support staff may reserve equipment.
  it("allows technical support staff to reserveEquipment", () => {
    expect(hasPermission("technical_support_staff", "reserveEquipment")).toBe(true);
  });

  // SPM-48 AC02: technical support staff get no event-planning, venue or attendee actions.
  it.each([
    "createEvent",
    "reviewEvent",
    "manageVenue",
    "decideVenueBooking",
    "registerForEvent",
  ] as const)("prevents technical support staff from %s", (permission) => {
    expect(hasPermission("technical_support_staff", permission)).toBe(false);
  });

  // SPM-16 AC02: venue staff get no event-planning, equipment or attendee actions.
  it.each(["createEvent", "reviewEvent", "reserveEquipment", "registerForEvent"] as const)(
    "prevents venue staff from %s",
    (permission) => {
      expect(hasPermission("venue_staff", permission)).toBe(false);
    },
  );
});
