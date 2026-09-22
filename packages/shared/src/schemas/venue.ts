import { z } from "zod";

const optionalText = (maximum: number) => z.string().trim().max(maximum);

/**
 * Venue Catalogue AC02/AC03: name, location, capacity, facilities and
 * operating hours are all mandatory to save. description/accessibilityNotes
 * are genuinely optional — real columns on public.venues, but not in AC02's
 * mandatory list.
 */
export const venueFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Venue name must contain between 2 and 160 characters")
    .max(160, "Venue name must contain between 2 and 160 characters"),
  location: z.string().trim().min(1, "Enter the venue location").max(240),
  capacity: z
    .string()
    .trim()
    .regex(/^[1-9]\d*$/, "Enter capacity as a positive whole number"),
  operatingHours: z
    .string()
    .trim()
    .min(1, "Enter the venue's operating days and hours")
    .max(500),
  facilities: z
    .array(z.string().trim().min(1).max(120))
    .min(1, "Add at least one facility")
    .max(30, "Add no more than 30 facilities"),
  description: optionalText(2_000),
  accessibilityNotes: optionalText(2_000),
});

export type VenueFormValues = z.infer<typeof venueFormSchema>;

export const emptyVenueFormValues: VenueFormValues = {
  name: "",
  location: "",
  capacity: "",
  operatingHours: "",
  facilities: [],
  description: "",
  accessibilityNotes: "",
};

/** Matches the jsonb keys public.create_venue/public.update_venue expect. */
export type VenuePayload = {
  name: string;
  location: string;
  capacity: number;
  operating_hours: string;
  description: string | null;
  accessibility_notes: string | null;
  facilities: string[];
};

export function toVenuePayload(values: VenueFormValues): VenuePayload {
  return {
    name: values.name.trim(),
    location: values.location.trim(),
    capacity: Number(values.capacity),
    operating_hours: values.operatingHours.trim(),
    description: values.description.trim() || null,
    accessibility_notes: values.accessibilityNotes.trim() || null,
    facilities: values.facilities.map((facility) => facility.trim()),
  };
}
