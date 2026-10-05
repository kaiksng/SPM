import { z } from "zod";

import { isValidSingaporeLocal } from "./venue-block";

const localDateTime = z
  .string()
  .min(1, "Enter a date and time")
  .refine((value) => !value || isValidSingaporeLocal(value), "Enter a valid date and time");

/**
 * SPM-30 form. Mirrors public.record_equipment_unavailability, which is
 * authoritative. Dates are Singapore-local datetime-local values, the same
 * as venue blocks (SPM-19).
 */
export const equipmentUnavailabilitySchema = z
  .object({
    equipmentItemId: z.string().min(1, "Choose equipment from the catalogue"),
    quantity: z
      .string()
      .trim()
      .min(1, "Enter a quantity")
      .regex(/^[1-9]\d*$/, "Enter a positive whole number"),
    reason: z
      .string()
      .trim()
      .min(1, "Enter a reason")
      .max(500, "Reason must contain at most 500 characters"),
    startsAt: localDateTime,
    endsAt: localDateTime,
  })
  .superRefine((value, context) => {
    if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
      context.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "End time must be after start time",
      });
    }
  });

export type EquipmentUnavailabilityFormValues = z.infer<typeof equipmentUnavailabilitySchema>;

/** Stock is a whole number of units; zero is allowed (none held). */
export const equipmentStockSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d*)$/, "Enter a whole number of 0 or more");
