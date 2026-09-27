import { z } from "zod";

export function isValidSingaporeLocal(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}+08:00`))
    && isoToSingaporeLocal(new Date(`${value}+08:00`).toISOString()) === value;
}

const localDateTime = z.string().min(1, "Enter a date and time")
  .refine((value) => !value || isValidSingaporeLocal(value), "Enter a valid date and time");

export const venueBlockSchema = z.object({
  venueId: z.uuid("Select a venue"),
  reason: z.string().trim().min(1, "Enter a reason"),
  startsAt: localDateTime,
  endsAt: localDateTime,
}).superRefine((value, context) => {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "End time must be after start time" });
  }
});

export type VenueBlockFormValues = z.infer<typeof venueBlockSchema>;

export function singaporeLocalToIso(value: string): string {
  return new Date(`${value}+08:00`).toISOString();
}

export function isoToSingaporeLocal(value: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(value));
  const field = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${field("year")}-${field("month")}-${field("day")}T${field("hour")}:${field("minute")}`;
}
