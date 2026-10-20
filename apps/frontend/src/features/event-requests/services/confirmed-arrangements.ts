import type {
  EquipmentRequirementReadiness,
  ReadinessStatus,
  VenueBookingReadiness,
} from "@spm/shared";

import type { EquipmentRequirement } from "@/features/event-requests/services/equipment";
import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

export type GroupedVenueBooking = VenueBookingRequestSummary & {
  readinessStatus: ReadinessStatus | null;
};

export type GroupedEquipmentRequirement = EquipmentRequirement & {
  readinessStatus: ReadinessStatus;
};

/**
 * Splits every venue booking an event has ever had into Confirmed, Pending /
 * Needs Review, and Other — a booking's bucket follows its derived readiness
 * status (event_readiness), not its raw request_status, so a flagged or
 * disrupted Approved booking lands in Pending / Needs Review rather than
 * reading as Confirmed. A booking absent from `readinessVenues` (readiness
 * only reports active — pending/approved/on_hold — bookings) is Rejected,
 * Cancelled or Expired and goes to Other with no readiness status of its own.
 */
export function groupVenueBookingsByReadiness(
  bookings: VenueBookingRequestSummary[],
  readinessVenues: VenueBookingReadiness[],
): {
  confirmed: GroupedVenueBooking[];
  pendingOrNeedsReview: GroupedVenueBooking[];
  other: GroupedVenueBooking[];
} {
  const statusByBookingId = new Map(
    readinessVenues.map((venue) => [venue.bookingId, venue.status]),
  );

  const confirmed: GroupedVenueBooking[] = [];
  const pendingOrNeedsReview: GroupedVenueBooking[] = [];
  const other: GroupedVenueBooking[] = [];

  for (const booking of bookings) {
    const readinessStatus = statusByBookingId.get(booking.id) ?? null;
    const grouped: GroupedVenueBooking = { ...booking, readinessStatus };
    if (readinessStatus === "complete") {
      confirmed.push(grouped);
    } else if (readinessStatus === "pending" || readinessStatus === "needs_review") {
      pendingOrNeedsReview.push(grouped);
    } else {
      other.push(grouped);
    }
  }

  const byStartsAt = (a: GroupedVenueBooking, b: GroupedVenueBooking) =>
    a.startsAt.localeCompare(b.startsAt);
  confirmed.sort(byStartsAt);
  pendingOrNeedsReview.sort(byStartsAt);
  other.sort(byStartsAt);

  return { confirmed, pendingOrNeedsReview, other };
}

/**
 * Splits an event's equipment requirements into Confirmed and Pending / Needs
 * Review by their technical-support arrangement status (event_readiness,
 * since the organiser cannot read equipment_arrangement_updates directly
 * under RLS). A requirement missing from `readinessEquipment` defensively
 * defaults to Pending rather than being dropped — it shouldn't happen since
 * both come from the same event_equipment_requirements rows.
 */
export function groupEquipmentByReadiness(
  equipment: EquipmentRequirement[],
  readinessEquipment: EquipmentRequirementReadiness[],
): {
  confirmed: GroupedEquipmentRequirement[];
  pendingOrNeedsReview: GroupedEquipmentRequirement[];
} {
  const statusByRequirementId = new Map(
    readinessEquipment.map((item) => [item.requirementId, item.status]),
  );

  const confirmed: GroupedEquipmentRequirement[] = [];
  const pendingOrNeedsReview: GroupedEquipmentRequirement[] = [];

  for (const requirement of equipment) {
    const readinessStatus = statusByRequirementId.get(requirement.id) ?? "pending";
    const grouped: GroupedEquipmentRequirement = { ...requirement, readinessStatus };
    if (readinessStatus === "complete") {
      confirmed.push(grouped);
    } else {
      pendingOrNeedsReview.push(grouped);
    }
  }

  return { confirmed, pendingOrNeedsReview };
}
