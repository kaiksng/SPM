import { describe, expect, it } from "vitest";

import { hasPermission } from "./permissions";

describe("role permissions", () => {
  it("allows organisers to create events", () => {
    expect(hasPermission("event_organiser", "createEvent")).toBe(true);
  });

  it("prevents attendees from reviewing events", () => {
    expect(hasPermission("attendee", "reviewEvent")).toBe(false);
  });
});
