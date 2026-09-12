import { z } from "zod";

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

export const equipmentRequirementSchema = z.object({
  equipmentName: z.string().trim().min(1, "Enter an equipment name").max(120),
  quantity: optionalPositiveWholeNumber.refine(
    (value) => value !== "",
    "Enter a quantity",
  ),
  notes: optionalText(1_000),
});

export const eventDraftSchema = z
  .object({
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
      layoutNotes: optionalText(2_000),
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
  })
  .superRefine(({ startsAt, endsAt, venue, registration }, context) => {
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
  });

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
};

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
    equipmentName: string;
    quantity: string;
    notes: string | null;
  }>;
  registration: {
    required: boolean;
    opensAt: string | null;
    closesAt: string | null;
    capacity: string | null;
    waitlistEnabled: boolean;
  };
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
    equipment: values.equipment.map((item) => ({
      equipmentName: item.equipmentName.trim(),
      quantity: item.quantity.trim(),
      notes: optionalValue(item.notes),
    })),
    registration: {
      required: values.registration.required,
      opensAt: optionalDateValue(values.registration.opensAt),
      closesAt: optionalDateValue(values.registration.closesAt),
      capacity: optionalValue(values.registration.capacity),
      waitlistEnabled: values.registration.waitlistEnabled,
    },
  };
}
