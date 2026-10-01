import { z } from "zod";

import { isValidSingaporeLocal } from "./venue-block";

export const venueSearchSchema = z.object({
  startsAt: z.string().min(1, "Enter a start date and time"),
  endsAt: z.string().min(1, "Enter an end date and time"),
  minimumCapacity: z.string().regex(/^[1-9]\d*$/, "Enter a positive minimum capacity")
    .refine((value) => Number(value) <= 2147483647, "Capacity is too large"),
  location: z.string(),
  layout: z.string().trim().max(120),
  facilities: z.array(z.string().trim().min(1)),
  accessibility: z.string(),
}).superRefine((value, context) => {
  for (const key of ["startsAt", "endsAt"] as const) {
    if (value[key] && !isValidSingaporeLocal(value[key])) {
      context.addIssue({ code: "custom", path: [key], message: "Enter a valid date and time" });
    }
  }
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time" });
  }
});

export type VenueSearchValues = z.infer<typeof venueSearchSchema>;
