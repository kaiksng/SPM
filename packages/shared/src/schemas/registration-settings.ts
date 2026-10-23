import { z } from "zod";

import { isValidSingaporeLocal } from "./venue-block";

/**
 * Configure Event Registration. Mirrors public.configure_event_registration,
 * which is authoritative — this exists so the organiser sees every problem
 * before a round trip. Times are Singapore local ("YYYY-MM-DDTHH:mm").
 */
export type RegistrationSettingsFormValues = {
  required: boolean;
  opensAt: string;
  closesAt: string;
  capacity: string;
  waitlistEnabled: boolean;
  withdrawalPermitted: boolean;
};

/**
 * `venueCapacity` is the approved main venue's capacity, or null when there
 * is none yet (AC08: capacity is then not limited by any venue).
 */
export function registrationSettingsSchema(venueCapacity: number | null) {
  return z
    .object({
      required: z.boolean(),
      opensAt: z.string().trim(),
      closesAt: z.string().trim(),
      capacity: z.string().trim(),
      waitlistEnabled: z.boolean(),
      withdrawalPermitted: z.boolean(),
    })
    .superRefine((values, context) => {
      // AC05: with registration off, nothing else is needed.
      if (!values.required) return;

      // AC03
      if (!values.opensAt) {
        context.addIssue({ code: "custom", path: ["opensAt"], message: "Enter the registration opening time" });
      } else if (!isValidSingaporeLocal(values.opensAt)) {
        context.addIssue({ code: "custom", path: ["opensAt"], message: "Enter a valid date and time" });
      }

      if (!values.closesAt) {
        context.addIssue({ code: "custom", path: ["closesAt"], message: "Enter the registration closing time" });
      } else if (!isValidSingaporeLocal(values.closesAt)) {
        context.addIssue({ code: "custom", path: ["closesAt"], message: "Enter a valid date and time" });
      }

      if (!/^[1-9]\d*$/.test(values.capacity)) {
        context.addIssue({
          code: "custom",
          path: ["capacity"],
          message: "Registration capacity must be a positive whole number",
        });
      } else if (venueCapacity !== null && Number(values.capacity) > venueCapacity) {
        // AC08
        context.addIssue({
          code: "custom",
          path: ["capacity"],
          message: `Registration capacity cannot exceed the main venue's capacity of ${venueCapacity}`,
        });
      }

      // AC04. Same-format local strings compare chronologically.
      if (
        isValidSingaporeLocal(values.opensAt) &&
        isValidSingaporeLocal(values.closesAt) &&
        values.closesAt <= values.opensAt
      ) {
        context.addIssue({
          code: "custom",
          path: ["closesAt"],
          message: "Registration closing time must be after its opening time",
        });
      }
    });
}

/**
 * AC08: a main venue approved after capacity was set may be smaller. This is
 * reported to the organiser, never corrected automatically.
 */
export function registrationExceedsVenueCapacity(
  capacity: number | null,
  venueCapacity: number | null,
): boolean {
  return capacity !== null && venueCapacity !== null && capacity > venueCapacity;
}
