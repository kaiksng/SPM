import type { Database } from "./database.types";

export type Venue = Database["public"]["Tables"]["venues"]["Row"];
export type NewVenue = Database["public"]["Tables"]["venues"]["Insert"];
export type VenueUpdate = Database["public"]["Tables"]["venues"]["Update"];

/**
 * A booking whose event's expected attendance is checked against a venue's
 * capacity. AC05/AC07: approved and pending bookings are the two statuses
 * the capacity-reduction warning applies to.
 */
export type VenueBookingAtRisk = {
  id: string;
  eventId: string;
  eventTitle: string;
  expectedAttendance: number;
  status: Database["public"]["Enums"]["request_status"];
};

export type DayCode = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/**
 * One block of a venue's operating hours: the same opensAt/closesAt applies
 * to every day in `days`. A day absent from every period in an
 * OperatingHours list is closed that day — there's no explicit "closed"
 * period.
 */
export type OperatingHoursPeriod = {
  days: DayCode[];
  opensAt: string; // "HH:MM", 24-hour
  closesAt: string; // "HH:MM", 24-hour
};

export type OperatingHours = OperatingHoursPeriod[];

/**
 * Standard room layout types a venue can support (seating/arrangement, not
 * size) — mirrored by public.find_matching_venues' layout_notes match on
 * venue_layouts.layout_name, so these values are what an event's layout
 * requirement is actually compared against.
 */
export const ROOM_LAYOUT_TYPES = [
  "Theatre",
  "Classroom",
  "Boardroom",
  "Banquet",
  "Open Floor",
  "Auditorium",
  "Exhibition",
] as const;

export type RoomLayoutType = (typeof ROOM_LAYOUT_TYPES)[number];

/**
 * Coerces a stored free-text value (pre-fixed-list event requirements, or
 * anything else unexpected) into a valid RoomLayoutType, or "" if it isn't
 * one — never throws, since old rows may hold text typed before this list
 * existed.
 */
export function asRoomLayoutType(value: string | null | undefined): RoomLayoutType | "" {
  return (ROOM_LAYOUT_TYPES as readonly string[]).includes(value ?? "")
    ? (value as RoomLayoutType)
    : "";
}
