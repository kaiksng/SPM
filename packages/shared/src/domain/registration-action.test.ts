import { describe, expect, it } from "vitest";

import { registrationActionNeeded, type RegistrationSettingsSnapshot } from "./registration-action";

const complete: RegistrationSettingsSnapshot = {
  required: true,
  opensAt: "2099-11-01T01:00:00.000Z",
  closesAt: "2099-11-30T10:00:00.000Z",
  capacity: 80,
};

describe("registrationActionNeeded", () => {
  it("asks for set-up while a Planning event's required registration is incomplete", () => {
    expect(registrationActionNeeded("planning", { ...complete, opensAt: null }, null)).toBe("setup");
    expect(registrationActionNeeded("planning", { ...complete, closesAt: null }, null)).toBe("setup");
    expect(registrationActionNeeded("planning", { ...complete, capacity: null }, 500)).toBe("setup");
  });

  it("flags capacity above the approved main venue's", () => {
    expect(registrationActionNeeded("planning", complete, 50)).toBe("over_capacity");
  });

  it("needs nothing when complete and within the venue, or with no venue yet", () => {
    expect(registrationActionNeeded("planning", complete, 80)).toBeNull();
    expect(registrationActionNeeded("planning", complete, null)).toBeNull();
  });

  it("needs nothing when registration isn't required", () => {
    expect(
      registrationActionNeeded("planning", { required: false, opensAt: null, closesAt: null, capacity: null }, 50),
    ).toBeNull();
  });

  it("needs nothing outside Planning, where the organiser can't change it", () => {
    for (const status of ["requested", "pending_safety_check", "confirmed", "cancelled"]) {
      expect(registrationActionNeeded(status, { ...complete, opensAt: null }, null)).toBeNull();
    }
  });
});
