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
    // Leading zeros ("04") are accepted; the value is sent as a number.
    quantity: z
      .string()
      .trim()
      .min(1, "Enter a quantity")
      .refine((value) => !value || isPositiveWholeNumber(value), "Enter a positive whole number"),
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

/**
 * Stock is a whole number of units; zero is allowed (none held). Leading
 * zeros ("04") are accepted, since a number input easily produces them.
 */
export const equipmentStockSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter a whole number of 0 or more");

/** "4", "04" and "004" are all 4; "0", "-1" and "1.5" are not positive whole numbers. */
export function isPositiveWholeNumber(value: string) {
  return /^\d+$/.test(value.trim()) && Number(value) > 0;
}
