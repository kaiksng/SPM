import { z } from "zod";

const optionalDateTime = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || !Number.isNaN(Date.parse(value)),
    "Enter a valid date and time",
  )
  .optional();

export const eventDraftSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(3, "Title must contain at least 3 characters")
      .max(160),
    description: z.string().trim().max(5_000).optional(),
    eventType: z.string().trim().max(100).optional(),
    expectedAttendance: z.coerce.number().int().positive().optional(),
    startsAt: optionalDateTime,
    endsAt: optionalDateTime,
  })
  .superRefine(({ startsAt, endsAt }, context) => {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after the start time",
      });
    }
  });

export type EventDraftInput = z.infer<typeof eventDraftSchema>;
