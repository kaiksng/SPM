import { describe, expect, it } from "vitest";

import {
  emptyVenueFormValues,
  toVenuePayload,
  venueFormSchema,
  type VenueFormValues,
} from "./venue";

function validValues(overrides: Partial<VenueFormValues> = {}): VenueFormValues {
  return {
    name: "Innovation Hall",
    location: "Block A, Level 2",
    areaTags: ["Central Area"],
    capacity: "120",
    operatingHours: [{ days: ["mon", "tue", "wed"], opensAt: "09:00", closesAt: "18:00" }],
    facilities: ["Projector", "Stage"],
    layouts: ["Theatre"],
    description: "",
    accessibilityNotes: "",
    ...overrides,
  };
}

function fieldErrors(values: unknown) {
  const errors: Record<string, string> = {};
  const result = venueFormSchema.safeParse(values);
  if (result.success) return errors;
  for (const issue of result.error.issues) errors[issue.path.join(".")] = issue.message;
  return errors;
}

describe("venueFormSchema", () => {
  it("accepts a complete venue", () => {
    expect(venueFormSchema.safeParse(validValues()).success).toBe(true);
  });

  // AC02: every mandatory field is reported at once, so the form can
  // highlight them all together.
  it("rejects the empty form with an error on every mandatory field", () => {
    const errors = fieldErrors(emptyVenueFormValues);

    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining([
        "name",
        "capacity",
        "operatingHours.0.days",
        "areaTags",
        "layouts",
      ]),
    );
  });

  describe("name", () => {
    it.each([
      ["2 characters", "ab", true],
      ["160 characters", "a".repeat(160), true],
      ["surrounding spaces trimmed to 2 characters", "  ab  ", true],
      ["1 character", "a", false],
      ["161 characters", "a".repeat(161), false],
      ["only spaces", "     ", false],
    ])("%s -> valid: %s", (_label, name, valid) => {
      const errors = fieldErrors(validValues({ name }));
      if (valid) {
        expect(errors.name).toBeUndefined();
      } else {
        expect(errors.name).toBe("Venue name must contain between 2 and 160 characters");
      }
    });

    it("trims the parsed name", () => {
      expect(venueFormSchema.parse(validValues({ name: "  Hall  " })).name).toBe("Hall");
    });
  });

  describe("optional address", () => {
    it.each([
      ["blank", "", true],
      ["only spaces", "   ", true],
      ["1 character", "A", true],
      ["240 characters", "a".repeat(240), true],
      ["241 characters", "a".repeat(241), false],
    ])("%s -> valid: %s", (_label, location, valid) => {
      expect(fieldErrors(validValues({ location })).location === undefined).toBe(valid);
    });

    it("requires one standard location choice", () => {
      expect(fieldErrors(validValues({ areaTags: [] })).areaTags).toBe("Select a location");
      expect(fieldErrors(validValues({ areaTags: ["Old Campus"] })).areaTags).toBeDefined();
    });
  });

  describe("capacity", () => {
    it.each([
      ["1", true],
      ["500", true],
      [" 80 ", true],
      ["0", false],
      ["01", false],
      ["1.5", false],
      ["-1", false],
      ["abc", false],
      ["", false],
    ])("%j -> valid: %s", (capacity, valid) => {
      const errors = fieldErrors(validValues({ capacity }));
      if (valid) {
        expect(errors.capacity).toBeUndefined();
      } else {
        expect(errors.capacity).toBe("Enter capacity as a positive whole number");
      }
    });
  });

  describe("operatingHours", () => {
    const period = (overrides: Record<string, unknown> = {}) => ({
      days: ["mon"],
      opensAt: "09:00",
      closesAt: "18:00",
      ...overrides,
    });

    it("requires at least one open day", () => {
      expect(
        fieldErrors(validValues({ operatingHours: [period({ days: [] })] as never }))[
          "operatingHours.0.days"
        ],
      ).toBe("Each operating hours period needs at least one day selected");
    });

    it("rejects an unknown day code", () => {
      expect(
        fieldErrors(validValues({ operatingHours: [period({ days: ["funday"] })] as never }))[
          "operatingHours.0.days.0"
        ],
      ).toBeDefined();
    });

    it.each([
      ["no periods", []],
      ["two periods", [period(), period({ days: ["sat"] })]],
    ])("rejects %s — exactly one period is allowed", (_label, operatingHours) => {
      expect(fieldErrors(validValues({ operatingHours: operatingHours as never })).operatingHours).toBe(
        "Enter the venue's operating days and hours",
      );
    });

    it.each(["24:00", "9:00", "09:60", "", "0900"])(
      "rejects the malformed opening time %j",
      (opensAt) => {
        expect(
          fieldErrors(validValues({ operatingHours: [period({ opensAt })] as never }))[
            "operatingHours.0.opensAt"
          ],
        ).toBe("Enter a valid opening time (HH:MM)");
      },
    );

    it.each(["24:00", "18:5", "25:00"])("rejects the malformed closing time %j", (closesAt) => {
      expect(
        fieldErrors(validValues({ operatingHours: [period({ closesAt })] as never }))[
          "operatingHours.0.closesAt"
        ],
      ).toBe("Enter a valid closing time (HH:MM)");
    });

    it.each([
      ["equal to", "09:00", "09:00"],
      ["after", "18:00", "09:00"],
    ])("rejects an opening time %s the closing time, on closesAt", (_label, opensAt, closesAt) => {
      expect(
        fieldErrors(validValues({ operatingHours: [period({ opensAt, closesAt })] as never }))[
          "operatingHours.0.closesAt"
        ],
      ).toBe("Opening time must be earlier than closing time");
    });

    it("accepts the widest valid day, 00:00 to 23:59", () => {
      expect(
        fieldErrors(
          validValues({ operatingHours: [period({ opensAt: "00:00", closesAt: "23:59" })] as never }),
        ),
      ).toEqual({});
    });
  });

  describe("facilities", () => {
    it.each([
      ["31 facilities", Array.from({ length: 31 }, (_, i) => `F${i}`), "Add no more than 30 facilities"],
    ])("rejects %s", (_label, facilities, message) => {
      expect(fieldErrors(validValues({ facilities })).facilities).toBe(message);
    });

    it.each([
      ["1 facility", ["Stage"]],
      ["30 facilities", Array.from({ length: 30 }, (_, i) => `F${i}`)],
      ["a 120-character facility", ["a".repeat(120)]],
    ])("accepts %s", (_label, facilities) => {
      expect(fieldErrors(validValues({ facilities }))).toEqual({});
    });

    it("allows a venue without listed amenities", () => {
      expect(fieldErrors(validValues({ facilities: [] }))).toEqual({});
    });

    it.each([
      ["an empty facility", [""]],
      ["a blank facility", ["   "]],
      ["a 121-character facility", ["a".repeat(121)]],
    ])("rejects %s", (_label, facilities) => {
      expect(fieldErrors(validValues({ facilities }))["facilities.0"]).toBeDefined();
    });
  });

  describe("layouts", () => {
    it("requires at least one layout", () => {
      expect(fieldErrors(validValues({ layouts: [] })).layouts).toBe(
        "Select at least one supported room layout",
      );
    });

    it("accepts several layouts", () => {
      expect(
        fieldErrors(validValues({ layouts: ["Theatre", "Banquet", "Classroom"] })),
      ).toEqual({});
    });

    it("accepts a custom layout and rejects an empty name", () => {
      expect(fieldErrors(validValues({ layouts: ["Cabaret"] }))).toEqual({});
      expect(fieldErrors(validValues({ layouts: ["   "] }))["layouts.0"]).toBeDefined();
    });
  });

  describe.each(["description", "accessibilityNotes"] as const)("%s (optional)", (field) => {
    it.each([
      ["blank", "", true],
      ["2000 characters", "a".repeat(2_000), true],
      ["2001 characters", "a".repeat(2_001), false],
    ])("%s -> valid: %s", (_label, text, valid) => {
      expect(fieldErrors(validValues({ [field]: text }))[field] === undefined).toBe(valid);
    });
  });
});

describe("emptyVenueFormValues", () => {
  it("defaults to one period of 09:00-18:00 with no days selected", () => {
    expect(emptyVenueFormValues.operatingHours).toEqual([
      { days: [], opensAt: "09:00", closesAt: "18:00" },
    ]);
  });
});

describe("toVenuePayload", () => {
  it("maps form values to the jsonb keys create_venue/update_venue expect", () => {
    expect(
      toVenuePayload(
        validValues({
          name: "  Innovation Hall ",
          location: " Block A ",
          capacity: "120",
          description: "  Big room  ",
          accessibilityNotes: " Ramp at entrance ",
          facilities: [" Projector ", "Stage"],
          layouts: ["Theatre", "Banquet"],
        }),
      ),
    ).toEqual({
      name: "Innovation Hall",
      location: "Block A",
      area_tags: ["Central Area"],
      capacity: 120,
      operating_hours: [{ days: ["mon", "tue", "wed"], opensAt: "09:00", closesAt: "18:00" }],
      description: "Big room",
      accessibility_notes: "Ramp at entrance",
      facilities: ["Projector", "Stage"],
      layouts: ["Theatre", "Banquet"],
    });
  });

  it("stores blank optional text as null, not an empty string", () => {
    const payload = toVenuePayload(validValues({ description: "   ", accessibilityNotes: "" }));

    expect(payload.description).toBeNull();
    expect(payload.accessibility_notes).toBeNull();
  });

  it("converts capacity to a number", () => {
    expect(toVenuePayload(validValues({ capacity: "45" })).capacity).toBe(45);
  });

  it("uses the selected location when no separate address is entered", () => {
    expect(toVenuePayload(validValues({ location: "", areaTags: ["Bugis"] })).location).toBe("Bugis");
  });
});
