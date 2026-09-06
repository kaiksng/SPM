import { describe, expect, it } from "vitest";

import { hasPermission } from "./permissions";

describe("role permissions", () => {
  it("allows organisers to create events", () => {
    expect(hasPermission("event_organiser", "createEvent")).toBe(true);
  });

  it("prevents attendees from reviewing events", () => {
    expect(hasPermission("attendee", "reviewEvent")).toBe(false);
  });

  it("allows administrators to perform every defined operation", () => {
    expect(hasPermission("administrator", "createEvent")).toBe(true);
    expect(hasPermission("administrator", "reviewEvent")).toBe(true);
    expect(hasPermission("administrator", "manageVenue")).toBe(true);
    expect(hasPermission("administrator", "reserveEquipment")).toBe(true);
    expect(hasPermission("administrator", "registerForEvent")).toBe(true);
  });
});
