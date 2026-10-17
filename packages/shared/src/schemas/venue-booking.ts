import { z } from "zod";

// SPM-85: what an additional venue booking states about itself. The first
// booking of an event takes these from the event, so it sends none of them.
export const venueBookingDetailsSchema = z.object({
  label: z.string().trim()
    .min(1, "Give this booking a label, for example Breakout 1")
    .max(80, "Keep the label to 80 characters"),
  startsAt: z.iso.datetime({ offset: true, error: "Enter a valid start date and time" }),
  endsAt: z.iso.datetime({ offset: true, error: "Enter a valid end date and time" }),
  expectedHeadcount: z.number("Enter how many people this venue must hold")
    .int("Enter a whole number of people")
    .min(1, "Enter how many people this venue must hold")
    .max(2147483647, "The headcount is too large"),
  layoutNotes: z.string().trim().max(120).optional(),
  accessibilityNotes: z.string().trim().max(500).optional(),
  requiredFacilities: z.array(z.string().trim().min(1)).max(50).optional(),
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
  path: ["endsAt"],
  message: "End time must be after start time",
});

export type VenueBookingDetails = z.infer<typeof venueBookingDetailsSchema>;
