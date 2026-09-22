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
