import { z } from "zod";

import { isPositiveWholeNumber } from "./equipment-unavailability";


const optionalText = (maximum: number) => z.string().trim().max(maximum);

const optionalPositiveWholeNumber = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || /^[1-9]\d*$/.test(value),
    "Enter a positive whole number",
  );

const optionalDateTime = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(value)),
    "Enter a valid date and time",
  );

/**
 * One equipment requirement as the form holds it. Mirrors
 * public.save_event_equipment_requirements, which is authoritative.
 */
const equipmentRequirementObject = z.object({
  /** The saved requirement's id; "" for a row added in this edit. */
  id: z.string(),
  /** The catalogue item (equipment_items.id); "" until one is chosen. */
  equipmentItemId: z.string(),
  /** A legacy free-text entry's name — shown, never sent (AC13). */
  legacyName: z.string(),
  quantity: z.string().trim(),
  requiredFrom: z.string().trim(),
  requiredUntil: z.string().trim(),
  /** Technical requirements. */
  notes: optionalText(1_000),
});

export type EquipmentRequirementFormValues = z.infer<typeof equipmentRequirementObject>;

/**
 * A row saved before the catalogue existed that has not been replaced yet.
 * It may only be kept as it is or replaced with a catalogue item, so none of
 * the catalogue rules below apply to it.
 */
export function isLegacyEquipmentRequirement(item: EquipmentRequirementFormValues) {
  return item.id !== "" && item.equipmentItemId === "";
}

export const equipmentRequirementSchema = equipmentRequirementObject.superRefine(
  (item, context) => {
    if (isLegacyEquipmentRequirement(item)) return;

    if (!item.equipmentItemId) {
      context.addIssue({
        code: "custom",
        path: ["equipmentItemId"],
        message: "Choose equipment from the catalogue",
      });
    }

    if (!isPositiveWholeNumber(item.quantity)) {
      context.addIssue({
        code: "custom",
        path: ["quantity"],
        message: item.quantity ? "Enter a positive whole number" : "Enter a quantity",
      });
    }

    const from = Date.parse(item.requiredFrom);
    const until = Date.parse(item.requiredUntil);

    if (Number.isNaN(from)) {
      context.addIssue({
        code: "custom",
        path: ["requiredFrom"],
        message: item.requiredFrom ? "Enter a valid date and time" : "Enter when it is required from",
      });
    }

    if (Number.isNaN(until)) {
      context.addIssue({
        code: "custom",
        path: ["requiredUntil"],
        message: item.requiredUntil ? "Enter a valid date and time" : "Enter when it is required until",
      });
    } else if (!Number.isNaN(from) && until <= from) {
      context.addIssue({
        code: "custom",
        path: ["requiredUntil"],
        message: "Required until must be after required from",
      });
    }
  },
);

/** A blank row for "Add equipment". The period covers setup through cleanup. */
export function emptyEquipmentRequirement(
  period: { requiredFrom?: string; requiredUntil?: string } = {},
): EquipmentRequirementFormValues {
  return {
    id: "",
    equipmentItemId: "",
    legacyName: "",
    quantity: "1",
    requiredFrom: period.requiredFrom ?? "",
    requiredUntil: period.requiredUntil ?? "",
    notes: "",
  };
}

const eventRequestObject = z.object({
  title: z
    .string()
    .trim()
    .min(3, "Event name must contain at least 3 characters")
    .max(160, "Event name must contain at most 160 characters"),
  purpose: optionalText(1_000),
  description: optionalText(5_000),
  eventType: optionalText(100),
  expectedAttendance: optionalPositiveWholeNumber,
  startsAt: optionalDateTime,
  endsAt: optionalDateTime,
  venue: z.object({
    preferredLocation: optionalText(240),
    minimumCapacity: optionalPositiveWholeNumber,
    accessibilityNotes: optionalText(2_000),
    // The UI offers layouts supported by catalogue venues; saved custom
    // values remain valid after a venue staff member creates a new layout.
    layoutNotes: optionalText(120),
    facilities: z
      .array(z.string().trim().min(1).max(120))
      .max(20, "Add no more than 20 facilities"),
  }),
  equipment: z.array(equipmentRequirementSchema).max(20),
  registration: z.object({
    required: z.boolean(),
    opensAt: optionalDateTime,
    closesAt: optionalDateTime,
    capacity: optionalPositiveWholeNumber,
    waitlistEnabled: z.boolean(),
  }),
  // PB-03 AC02. A draft may leave this false; submission requires it.
  requirementsAcknowledged: z.boolean(),
});

type EventRequestShape = z.infer<typeof eventRequestObject>;

/**
 * Cross-field rules that hold in both draft and submission mode. Kept in one
 * place so PB-03's stricter schema cannot drift away from PB-02's.
 */
function addSharedCrossFieldIssues(
  { startsAt, endsAt, venue, registration }: EventRequestShape,
  context: z.RefinementCtx,
) {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    context.addIssue({
      code: "custom",
      path: ["endsAt"],
      message: "End time must be after the start time",
    });
  }

  if (
    registration.opensAt &&
    registration.closesAt &&
    new Date(registration.closesAt) <= new Date(registration.opensAt)
  ) {
    context.addIssue({
      code: "custom",
      path: ["registration", "closesAt"],
      message: "Registration closing time must be after its opening time",
    });
  }

  const normalisedFacilities = venue.facilities.map((facility) =>
    facility.toLocaleLowerCase(),
  );
  if (new Set(normalisedFacilities).size !== normalisedFacilities.length) {
    context.addIssue({
      code: "custom",
      path: ["venue", "facilities"],
      message: "Each required facility can appear only once",
    });
  }
}

export const eventDraftSchema = eventRequestObject.superRefine(
  addSharedCrossFieldIssues,
);

export type EventRequestFormValues = z.infer<typeof eventDraftSchema>;

export const emptyEventRequestFormValues: EventRequestFormValues = {
  title: "",
  purpose: "",
  description: "",
  eventType: "",
  expectedAttendance: "",
  startsAt: "",
  endsAt: "",
  venue: {
    preferredLocation: "",
    minimumCapacity: "",
    accessibilityNotes: "",
    layoutNotes: "",
    facilities: [],
  },
  equipment: [],
  registration: {
    required: false,
    opensAt: "",
    closesAt: "",
    capacity: "",
    waitlistEnabled: false,
  },
  requirementsAcknowledged: false,
};

/**
 * PB-03 submission rules. Everything PB-02 validates for a draft still applies;
 * this schema adds the completeness the coordinator needs before review, and
 * mirrors public.submit_event_request in the database field for field. The
 * database is authoritative — this schema exists so the organiser sees every
 * problem before a round trip (AC06).
 */
export const eventSubmissionSchema = eventRequestObject
  .extend({
    purpose: z
      .string()
      .trim()
      .min(1, "Describe the purpose of the event before submitting")
      .max(1_000),
    description: z
      .string()
      .trim()
      .min(1, "Describe the event before submitting")
      .max(5_000),
    expectedAttendance: z
      .string()
      .trim()
      .regex(/^[1-9]\d*$/, "Enter the expected attendance as a whole number"),
    startsAt: z
      .string()
      .trim()
      .min(1, "Enter the proposed start date and time")
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        "Enter a valid date and time",
      ),
    endsAt: z
      .string()
      .trim()
      .min(1, "Enter the proposed end date and time")
      .refine(
        (value) => !Number.isNaN(Date.parse(value)),
        "Enter a valid date and time",
      ),
  })
  .superRefine((values, context) => {
    addSharedCrossFieldIssues(values, context);

    if (values.startsAt && new Date(values.startsAt) <= new Date()) {
      context.addIssue({
        code: "custom",
        path: ["startsAt"],
        message: "The proposed start date and time must be in the future",
      });
    }

    const { preferredLocation, minimumCapacity, accessibilityNotes, layoutNotes } =
      values.venue;
    if (
      !preferredLocation &&
      !minimumCapacity &&
      !accessibilityNotes &&
      !layoutNotes
    ) {
      context.addIssue({
        code: "custom",
        path: ["venue", "preferredLocation"],
        message: "Add at least one venue requirement before submitting",
      });
    }
  });

export type EventSubmissionFormValues = z.infer<typeof eventSubmissionSchema>;

export type EventDraftPayload = {
  title: string;
  purpose: string | null;
  description: string | null;
  eventType: string | null;
  expectedAttendance: string | null;
  startsAt: string | null;
  endsAt: string | null;
  venue: {
    preferredLocation: string | null;
    minimumCapacity: string | null;
    accessibilityNotes: string | null;
    layoutNotes: string | null;
    facilities: string[];
  };
  equipment: Array<{
    id: string | null;
    equipmentItemId: string | null;
    quantity: string;
    requiredFrom: string | null;
    requiredUntil: string | null;
    notes: string | null;
  }>;
  registration: {
    required: boolean;
    opensAt: string | null;
    closesAt: string | null;
    capacity: string | null;
    waitlistEnabled: boolean;
  };
  requirementsAcknowledged: boolean;
};

const optionalValue = (value: string) => value.trim() || null;
const optionalDateValue = (value: string) =>
  value ? new Date(value).toISOString() : null;

export function toEventDraftPayload(
  values: EventRequestFormValues,
): EventDraftPayload {
  return {
    title: values.title.trim(),
    purpose: optionalValue(values.purpose),
    description: optionalValue(values.description),
    eventType: optionalValue(values.eventType),
    expectedAttendance: optionalValue(values.expectedAttendance),
    startsAt: optionalDateValue(values.startsAt),
    endsAt: optionalDateValue(values.endsAt),
    venue: {
      preferredLocation: optionalValue(values.venue.preferredLocation),
      minimumCapacity: optionalValue(values.venue.minimumCapacity),
      accessibilityNotes: optionalValue(values.venue.accessibilityNotes),
      layoutNotes: optionalValue(values.venue.layoutNotes),
      facilities: values.venue.facilities.map((facility) => facility.trim()),
    },
    // A kept legacy row is sent by id alone; the database leaves it as is.
    equipment: values.equipment.map((item) =>
      isLegacyEquipmentRequirement(item)
        ? {
            id: item.id,
            equipmentItemId: null,
            quantity: "",
            requiredFrom: null,
            requiredUntil: null,
            notes: null,
          }
        : {
            id: item.id || null,
            equipmentItemId: item.equipmentItemId,
            // "04" -> "4": the database only accepts a plain positive whole number.
            quantity: String(Number(item.quantity)),
            requiredFrom: optionalDateValue(item.requiredFrom),
            requiredUntil: optionalDateValue(item.requiredUntil),
            notes: optionalValue(item.notes),
          },
    ),
    registration: {
      required: values.registration.required,
      opensAt: values.registration.required
        ? optionalDateValue(values.registration.opensAt)
        : null,
      closesAt: values.registration.required
        ? optionalDateValue(values.registration.closesAt)
        : null,
      // SPM-40: capacity is set in Planning, not copied from the attendance.
      capacity: values.registration.required
        ? optionalValue(values.registration.capacity)
        : null,
      waitlistEnabled:
        values.registration.required && values.registration.waitlistEnabled,
    },
    // Kept for compatibility with the existing submission function. The
    // simplified form treats blank optional sections as "not required".
    requirementsAcknowledged: true,
  };
}
