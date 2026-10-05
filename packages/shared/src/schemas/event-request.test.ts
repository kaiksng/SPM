import { describe, expect, it } from "vitest";

import {
  emptyEquipmentRequirement,
  emptyEventRequestFormValues,
  eventDraftSchema,
  isLegacyEquipmentRequirement,
  eventSubmissionSchema,
  toEventDraftPayload,
} from "./event-request";

function draft(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyEventRequestFormValues,
    venue: { ...emptyEventRequestFormValues.venue },
    registration: { ...emptyEventRequestFormValues.registration },
    equipment: [],
    title: "Orientation briefing",
    ...overrides,
  };
}

describe("event draft validation", () => {
  it.each([
    ["ab", false],
    ["abc", true],
    ["a".repeat(160), true],
    ["a".repeat(161), false],
  ])("validates the event name boundary", (title, expected) => {
    expect(eventDraftSchema.safeParse(draft({ title })).success).toBe(expected);
  });

  it.each([
    ["", true],
    ["0", false],
    ["1", true],
    ["1.5", false],
  ])("validates optional attendance value %s", (expectedAttendance, expected) => {
    expect(
      eventDraftSchema.safeParse(draft({ expectedAttendance })).success,
    ).toBe(expected);
  });

  it("rejects an end time equal to or before the start time", () => {
    for (const endsAt of ["2026-09-25T09:59", "2026-09-25T10:00"]) {
      expect(
        eventDraftSchema.safeParse(
          draft({ startsAt: "2026-09-25T10:00", endsAt }),
        ).success,
      ).toBe(false);
    }
  });

  it("accepts an empty or later end time", () => {
    for (const endsAt of ["", "2026-09-25T10:01"]) {
      expect(
        eventDraftSchema.safeParse(
          draft({ startsAt: "2026-09-25T10:00", endsAt }),
        ).success,
      ).toBe(true);
    }
  });

  it("requires valid equipment rows and unique facilities", () => {
    const result = eventDraftSchema.safeParse(
      draft({
        venue: {
          ...emptyEventRequestFormValues.venue,
          facilities: ["Projector", "projector"],
        },
        equipment: [emptyEquipmentRequirement({ requiredFrom: "", requiredUntil: "" })],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("normalises dates and blanks for persistence", () => {
    const parsed = eventDraftSchema.parse(
      draft({
        purpose: "  Student welcome  ",
        startsAt: "2026-09-25T10:00",
      }),
    );
    const payload = toEventDraftPayload(parsed);

    expect(payload.purpose).toBe("Student welcome");
    expect(payload.description).toBeNull();
    expect(payload.startsAt).toMatch(/^2026-09-25T/);
  });

  it("automatically acknowledges blank optional sections for compatibility", () => {
    const parsed = eventDraftSchema.parse(draft());
    expect(toEventDraftPayload(parsed).requirementsAcknowledged).toBe(true);
  });

  it("derives registration capacity from expected attendance", () => {
    const parsed = eventDraftSchema.parse(
      draft({
        expectedAttendance: "80",
        registration: {
          ...emptyEventRequestFormValues.registration,
          required: true,
        },
      }),
    );

    expect(toEventDraftPayload(parsed)).toMatchObject({
      registration: { required: true, capacity: "80" },
      requirementsAcknowledged: true,
    });
  });
});

describe("equipment requirement validation", () => {
  const validItem = {
    ...emptyEquipmentRequirement(),
    equipmentItemId: "11111111-1111-1111-1111-111111111111",
    quantity: "2",
    requiredFrom: "2099-04-01T08:00",
    requiredUntil: "2099-04-01T13:00",
  };

  function equipmentErrors(item: Record<string, string>) {
    const result = eventDraftSchema.safeParse(draft({ equipment: [{ ...validItem, ...item }] }));
    const errors: Record<string, string> = {};
    if (!result.success) {
      for (const issue of result.error.issues) errors[issue.path.join(".")] = issue.message;
    }
    return errors;
  }

  it("accepts a catalogue item with a quantity and required period", () => {
    expect(equipmentErrors({})).toEqual({});
  });

  it("identifies each missing mandatory field (AC03/AC06)", () => {
    expect(
      equipmentErrors({ equipmentItemId: "", quantity: "", requiredFrom: "", requiredUntil: "" }),
    ).toEqual({
      "equipment.0.equipmentItemId": "Choose equipment from the catalogue",
      "equipment.0.quantity": "Enter a quantity",
      "equipment.0.requiredFrom": "Enter when it is required from",
      "equipment.0.requiredUntil": "Enter when it is required until",
    });
  });

  it.each(["0", "-1", "1.5", "two"])("rejects quantity %s (AC04)", (quantity) => {
    expect(equipmentErrors({ quantity })).toEqual({
      "equipment.0.quantity": "Enter a positive whole number",
    });
  });

  it.each(["2099-04-01T08:00", "2099-04-01T07:59"])(
    "rejects a period that ends at or before it starts (%s)",
    (requiredUntil) => {
      expect(equipmentErrors({ requiredUntil })).toEqual({
        "equipment.0.requiredUntil": "Required until must be after required from",
      });
    },
  );

  it("allows the period to extend beyond the event for setup and cleanup (AC05)", () => {
    const result = eventDraftSchema.safeParse(
      draft({
        startsAt: "2099-04-01T10:00",
        endsAt: "2099-04-01T12:00",
        equipment: [validItem],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("leaves technical requirements optional but caps them at 1,000 characters", () => {
    expect(equipmentErrors({ notes: "" })).toEqual({});
    expect(Object.keys(equipmentErrors({ notes: "a".repeat(1_001) }))).toEqual([
      "equipment.0.notes",
    ]);
  });

  it("accepts the same catalogue item more than once (AC10)", () => {
    expect(
      eventDraftSchema.safeParse(draft({ equipment: [validItem, { ...validItem }] })).success,
    ).toBe(true);
  });

  it("keeps a legacy free-text entry without catalogue rules (AC13)", () => {
    const legacy = {
      ...emptyEquipmentRequirement(),
      id: "22222222-2222-2222-2222-222222222222",
      legacyName: "Old projector",
    };
    const parsed = eventDraftSchema.parse(draft({ equipment: [legacy] }));

    expect(isLegacyEquipmentRequirement(parsed.equipment[0]!)).toBe(true);
    expect(toEventDraftPayload(parsed).equipment).toEqual([
      {
        id: legacy.id,
        equipmentItemId: null,
        quantity: "",
        requiredFrom: null,
        requiredUntil: null,
        notes: null,
      },
    ]);
  });

  it("sends a catalogue row with its id, item and ISO period", () => {
    const parsed = eventDraftSchema.parse(
      draft({ equipment: [{ ...validItem, id: "33333333-3333-3333-3333-333333333333", notes: "  XLR  " }] }),
    );
    const [item] = toEventDraftPayload(parsed).equipment;

    expect(item).toMatchObject({
      id: "33333333-3333-3333-3333-333333333333",
      equipmentItemId: validItem.equipmentItemId,
      quantity: "2",
      notes: "XLR",
    });
    expect(item!.requiredFrom).toMatch(/^2099-04-01T/);
    expect(item!.requiredUntil).toMatch(/^2099-04-01T/);
  });

  it("accepts a quantity typed with a leading zero and sends the plain number", () => {
    const parsed = eventDraftSchema.parse(draft({ equipment: [{ ...validItem, quantity: "04" }] }));
    expect(toEventDraftPayload(parsed).equipment[0]!.quantity).toBe("4");
  });

  it("sends a new row without an id", () => {
    const parsed = eventDraftSchema.parse(draft({ equipment: [validItem] }));
    expect(toEventDraftPayload(parsed).equipment[0]!.id).toBeNull();
  });
});

/** A datetime-local string a whole number of days away from now. */
function relativeDateTime(days: number) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1_000);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function submission(overrides: Record<string, unknown> = {}) {
  return draft({
    purpose: "Welcome new students",
    description: "A briefing for the incoming cohort.",
    expectedAttendance: "120",
    startsAt: relativeDateTime(30),
    endsAt: relativeDateTime(31),
    venue: {
      ...emptyEventRequestFormValues.venue,
      preferredLocation: "School of Computing",
    },
    ...overrides,
  });
}

describe("event submission validation (PB-03)", () => {
  it("accepts a complete request", () => {
    expect(eventSubmissionSchema.safeParse(submission()).success).toBe(true);
  });

  // AC01: every mandatory field is required at submission but optional in a draft.
  it.each([
    ["purpose", ""],
    ["description", ""],
    ["expectedAttendance", ""],
    ["startsAt", ""],
    ["endsAt", ""],
  ])("requires %s at submission though a draft may omit it", (field, value) => {
    const values = submission({ [field]: value });

    expect(eventSubmissionSchema.safeParse(values).success).toBe(false);
    expect(eventDraftSchema.safeParse(values).success).toBe(true);
  });

  it.each([
    ["0", false],
    ["1", true],
    ["1.5", false],
    ["", false],
  ])("validates submitted attendance %s", (expectedAttendance, expected) => {
    expect(
      eventSubmissionSchema.safeParse(submission({ expectedAttendance }))
        .success,
    ).toBe(expected);
  });

  it("rejects a start date in the past", () => {
    const result = eventSubmissionSchema.safeParse(
      submission({ startsAt: relativeDateTime(-1), endsAt: relativeDateTime(1) }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "startsAt")).toBe(
      true,
    );
  });

  // AC02.
  it("requires at least one venue requirement", () => {
    const result = eventSubmissionSchema.safeParse(
      submission({ venue: { ...emptyEventRequestFormValues.venue } }),
    );

    expect(result.success).toBe(false);
  });

  it.each([
    [
      {
        ...emptyEventRequestFormValues.venue,
        preferredLocation: "City centre",
      },
    ],
    [
      {
        ...emptyEventRequestFormValues.venue,
        layoutNotes: "Theatre",
      },
    ],
    [
      {
        ...emptyEventRequestFormValues.venue,
        accessibilityNotes: "Step-free access",
      },
    ],
  ])("accepts any single venue requirement", (venue) => {
    expect(eventSubmissionSchema.safeParse(submission({ venue })).success).toBe(
      true,
    );
  });

  it("accepts registration without asking for setup details", () => {
    const result = eventSubmissionSchema.safeParse(
      submission({
        registration: {
          ...emptyEventRequestFormValues.registration,
          required: true,
        },
      }),
    );

    expect(result.success).toBe(true);
  });

  // AC06: the organiser sees every problem at once, not one at a time.
  it("reports every affected field in a single pass", () => {
    const result = eventSubmissionSchema.safeParse(
      submission({
        purpose: "",
        description: "",
        expectedAttendance: "",
        venue: { ...emptyEventRequestFormValues.venue },
      }),
    );

    expect(result.success).toBe(false);
    expect(
      new Set(result.error?.issues.map((issue) => issue.path.join("."))),
    ).toEqual(
      new Set([
        "purpose",
        "description",
        "expectedAttendance",
        "venue.preferredLocation",
      ]),
    );
  });

  it("still enforces the shared draft rules", () => {
    const result = eventSubmissionSchema.safeParse(
      submission({
        startsAt: relativeDateTime(31),
        endsAt: relativeDateTime(30),
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path[0] === "endsAt")).toBe(
      true,
    );
  });
});
