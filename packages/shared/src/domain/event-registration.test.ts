import { describe, expect, it } from "vitest";

import { computeRegistrationState, type RegistrationAvailability } from "./event-registration";

const NOW = new Date("2026-11-01T00:00:00Z");

const baseAvailability: RegistrationAvailability = {
  required: true,
  opensAt: null,
  closesAt: null,
  capacity: 50,
};

describe("computeRegistrationState", () => {
  it("returns not_required when the event doesn't require registration", () => {
    expect(computeRegistrationState({ ...baseAvailability, required: false }, 0, null, NOW)).toBe(
      "not_required",
    );
  });

  it("returns open when capacity remains and the window is open", () => {
    expect(computeRegistrationState(baseAvailability, 32, null, NOW)).toBe("open");
  });

  it("returns full once the registered count reaches capacity", () => {
    expect(computeRegistrationState(baseAvailability, 50, null, NOW)).toBe("full");
  });

  it("returns full even over capacity, never a negative state", () => {
    expect(computeRegistrationState(baseAvailability, 51, null, NOW)).toBe("full");
  });

  it("treats a null capacity as unlimited — never full", () => {
    expect(computeRegistrationState({ ...baseAvailability, capacity: null }, 10_000, null, NOW)).toBe(
      "open",
    );
  });

  it("returns not_open before the registration window opens", () => {
    const availability = { ...baseAvailability, opensAt: "2026-11-02T00:00:00Z" };
    expect(computeRegistrationState(availability, 0, null, NOW)).toBe("not_open");
  });

  it("returns closed after the registration window closes", () => {
    const availability = { ...baseAvailability, closesAt: "2026-10-31T00:00:00Z" };
    expect(computeRegistrationState(availability, 0, null, NOW)).toBe("closed");
  });

  it("returns registered when the attendee already holds a registered row, regardless of capacity", () => {
    expect(computeRegistrationState(baseAvailability, 50, "registered", NOW)).toBe("registered");
  });

  it("returns waitlisted when the attendee is on the waiting list", () => {
    expect(computeRegistrationState(baseAvailability, 50, "waitlisted", NOW)).toBe("waitlisted");
  });

  it("own status takes priority even if the window is closed or not yet open", () => {
    const closedAvailability = { ...baseAvailability, closesAt: "2026-10-31T00:00:00Z" };
    expect(computeRegistrationState(closedAvailability, 0, "waitlisted", NOW)).toBe("waitlisted");
  });
});
