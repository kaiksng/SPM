import { describe, expect, it } from "vitest";

import {
  emptyEventRequestFormValues,
  eventDraftSchema,
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
        equipment: [{ equipmentName: "", quantity: "0", notes: "" }],
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

  it("defaults the requirements acknowledgement to false on a draft", () => {
    const parsed = eventDraftSchema.parse(draft());
    expect(toEventDraftPayload(parsed).requirementsAcknowledged).toBe(false);
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
    requirementsAcknowledged: true,
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
    [{ ...emptyEventRequestFormValues.venue, minimumCapacity: "50" }],
    [{ ...emptyEventRequestFormValues.venue, accessibilityNotes: "Step free" }],
    [{ ...emptyEventRequestFormValues.venue, layoutNotes: "Theatre" }],
  ])("accepts any single venue requirement", (venue) => {
    expect(eventSubmissionSchema.safeParse(submission({ venue })).success).toBe(
      true,
    );
  });

  it("requires a capacity only when registration is required", () => {
    const withRegistration = (required: boolean, capacity: string) =>
      submission({
        registration: {
          ...emptyEventRequestFormValues.registration,
          required,
          capacity,
        },
      });

    expect(
      eventSubmissionSchema.safeParse(withRegistration(true, "")).success,
    ).toBe(false);
    expect(
      eventSubmissionSchema.safeParse(withRegistration(true, "100")).success,
    ).toBe(true);
    expect(
      eventSubmissionSchema.safeParse(withRegistration(false, "")).success,
    ).toBe(true);
  });

  it("requires the optional-requirements acknowledgement", () => {
    const result = eventSubmissionSchema.safeParse(
      submission({ requirementsAcknowledged: false }),
    );

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.some(
        (issue) => issue.path[0] === "requirementsAcknowledged",
      ),
    ).toBe(true);
  });

  // AC06: the organiser sees every problem at once, not one at a time.
  it("reports every affected field in a single pass", () => {
    const result = eventSubmissionSchema.safeParse(
      submission({
        purpose: "",
        description: "",
        expectedAttendance: "",
        requirementsAcknowledged: false,
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
        "requirementsAcknowledged",
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
