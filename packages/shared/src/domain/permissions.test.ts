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

  // SPM-16 AC02: venue staff get no event-planning, equipment or attendee actions.
  it.each(["createEvent", "reviewEvent", "reserveEquipment", "registerForEvent"] as const)(
    "prevents venue staff from %s",
    (permission) => {
      expect(hasPermission("venue_staff", permission)).toBe(false);
    },
  );
});
