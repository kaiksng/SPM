import { describe, expect, it } from "vitest";

import {
  registrationExceedsVenueCapacity,
  registrationSettingsSchema,
  type RegistrationSettingsFormValues,
} from "./registration-settings";

const valid: RegistrationSettingsFormValues = {
  required: true,
  opensAt: "2099-01-01T09:00",
  closesAt: "2099-01-10T18:00",
  capacity: "120",
  waitlistEnabled: true,
  withdrawalPermitted: false,
};

function issuePaths(values: RegistrationSettingsFormValues, venueCapacity: number | null = null) {
  const result = registrationSettingsSchema(venueCapacity).safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.path[0]);
}

describe("registrationSettingsSchema", () => {
  // AC03: all five settings set correctly.
  it("accepts complete settings", () => {
    expect(issuePaths(valid)).toEqual([]);
  });

  // AC03: opening time, closing time and capacity are required when enabled.
  it("requires opening time, closing time and capacity when registration is on", () => {
    expect(issuePaths({ ...valid, opensAt: "", closesAt: "", capacity: "" })).toEqual(
      expect.arrayContaining(["opensAt", "closesAt", "capacity"]),
    );
  });

  // AC03: capacity must be a positive whole number.
  it.each(["0", "-5", "2.5", "abc"])("rejects capacity %s", (capacity) => {
    expect(issuePaths({ ...valid, capacity })).toEqual(["capacity"]);
  });

  // AC04: opening must be earlier than closing.
  it("rejects a closing time equal to or before the opening time", () => {
    expect(issuePaths({ ...valid, closesAt: valid.opensAt })).toEqual(["closesAt"]);
    expect(issuePaths({ ...valid, closesAt: "2098-12-31T09:00" })).toEqual(["closesAt"]);
  });

  // AC05: registration off needs no other settings.
  it("needs nothing else when registration is off", () => {
    expect(issuePaths({ ...valid, required: false, opensAt: "", closesAt: "", capacity: "" })).toEqual([]);
  });

  // AC08: capped by the approved main venue, uncapped without one.
  it("caps capacity at the main venue's capacity only when there is one", () => {
    expect(issuePaths({ ...valid, capacity: "101" }, 100)).toEqual(["capacity"]);
    expect(issuePaths({ ...valid, capacity: "100" }, 100)).toEqual([]);
    expect(issuePaths({ ...valid, capacity: "5000" }, null)).toEqual([]);
  });
});

describe("registrationExceedsVenueCapacity", () => {
  // AC08: a smaller venue approved later is flagged.
  it("flags capacity above the venue's capacity", () => {
    expect(registrationExceedsVenueCapacity(150, 100)).toBe(true);
    expect(registrationExceedsVenueCapacity(100, 100)).toBe(false);
    expect(registrationExceedsVenueCapacity(150, null)).toBe(false);
    expect(registrationExceedsVenueCapacity(null, 100)).toBe(false);
  });
});
