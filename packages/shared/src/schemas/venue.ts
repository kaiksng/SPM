import { z } from "zod";

import type { OperatingHours } from "../types/venue";
import { LOCATION_AREAS } from "../types/event-choices";

const optionalText = (maximum: number) => z.string().trim().max(maximum);

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * One operating-hours period: the same opensAt/closesAt for every day in
 * `days`. Mirrors public.validate_operating_hours (venue_catalogue_write_
 * functions.sql) so the same shape is rejected client- and server-side.
 */
const operatingHoursPeriodSchema = z
  .object({
    days: z
      .array(z.enum(DAY_CODES))
      .min(1, "Each operating hours period needs at least one day selected"),
    opensAt: z
      .string()
      .regex(TIME_PATTERN, "Enter a valid opening time (HH:MM)"),
    closesAt: z
      .string()
      .regex(TIME_PATTERN, "Enter a valid closing time (HH:MM)"),
  })
  .refine((period) => period.opensAt < period.closesAt, {
    message: "Opening time must be earlier than closing time",
    path: ["closesAt"],
  });

// Exactly one period — a venue's hours are one set of open days sharing one
// opens/closes time, not several ranges. Storage stays an array (matches
// public.venues.operating_hours's jsonb shape) but is always length 1.
const operatingHoursSchema = z
  .array(operatingHoursPeriodSchema)
  .length(1, "Enter the venue's operating days and hours");

/**
 * Venue Catalogue: a name, location area, capacity, room layout,
 * and operating hours are mandatory. A venue may have no listed amenities.
 * Description and accessibility notes are optional.
 */
export const venueFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Venue name must contain between 2 and 160 characters")
    .max(160, "Venue name must contain between 2 and 160 characters"),
  location: z.string().trim().max(240),
  areaTags: z.array(z.string()).length(1, "Select a location").refine(
    (tags) => tags.every((tag) => LOCATION_AREAS.some((area) => area === tag)),
    "Select a location from the standard list",
  ),
  capacity: z
    .string()
    .trim()
    .regex(/^[1-9]\d*$/, "Enter capacity as a positive whole number"),
  operatingHours: operatingHoursSchema,
  facilities: z
    .array(z.string().trim().min(1).max(120))
    .max(30, "Add no more than 30 facilities"),
  layouts: z.array(z.string().trim().min(1).max(120))
    .min(1, "Select at least one supported room layout")
    .max(30, "Add no more than 30 layouts"),
  description: optionalText(2_000),
  accessibilityNotes: optionalText(2_000),
});

export type VenueFormValues = z.infer<typeof venueFormSchema>;

export const emptyVenueFormValues: VenueFormValues = {
  name: "",
  location: "",
  areaTags: [],
  capacity: "",
  operatingHours: [{ days: [], opensAt: "09:00", closesAt: "18:00" }],
  facilities: [],
  layouts: [],
  description: "",
  accessibilityNotes: "",
};

/** Matches the jsonb keys public.create_venue/public.update_venue expect. */
export type VenuePayload = {
  name: string;
  location: string;
  area_tags: string[];
  capacity: number;
  operating_hours: OperatingHours;
  description: string | null;
  accessibility_notes: string | null;
  facilities: string[];
  layouts: string[];
};

export function toVenuePayload(values: VenueFormValues): VenuePayload {
  return {
    name: values.name.trim(),
    location: values.location.trim() || values.areaTags[0] || "",
    area_tags: values.areaTags,
    capacity: Number(values.capacity),
    operating_hours: values.operatingHours,
    description: values.description.trim() || null,
    accessibility_notes: values.accessibilityNotes.trim() || null,
    facilities: values.facilities.map((facility) => facility.trim()),
    layouts: values.layouts,
  };
}
