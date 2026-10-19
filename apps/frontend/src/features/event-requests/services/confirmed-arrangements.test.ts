import { describe, expect, it } from "vitest";

import type { EquipmentRequirementReadiness, VenueBookingReadiness } from "@spm/shared";

import type { EquipmentRequirement } from "@/features/event-requests/services/equipment";
import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

import { groupEquipmentByReadiness, groupVenueBookingsByReadiness } from "./confirmed-arrangements";

function booking(overrides: Partial<VenueBookingRequestSummary> = {}): VenueBookingRequestSummary {
  return {
    id: "booking-1",
    status: "approved",
    startsAt: "2099-04-06T02:00:00Z",
    endsAt: "2099-04-06T04:00:00Z",
    requestedAt: "2099-04-01T00:00:00Z",
    decidedAt: null,
    decisionNotes: null,
    expiresAt: null,
    venueId: "venue-1",
    venueName: "Auditorium",
    venueLayouts: [],
    eventId: "event-1",
    eventTitle: "Career Fair",
    eventExpectedAttendance: 50,
    eventVenueRequirements: {
      preferredLocation: null,
      minimumCapacity: null,
      accessibilityNotes: null,
      layoutNotes: null,
      facilities: [],
    },
    requestedByName: "Priya",
    decidedByName: null,
    replacesBookingId: null,
    replacesVenueName: null,
    advisoryNotes: null,
    label: "Main Programme",
    expectedHeadcount: 50,
    isMainVenue: true,
    venueLocation: null,
    venueAreaTags: [],
    cancellationReason: null,
    cancelledAt: null,
    cancelledByName: null,
    mainDesignatedAt: null,
    ...overrides,
  };
}

function venueReadiness(overrides: Partial<VenueBookingReadiness> = {}): VenueBookingReadiness {
  return { bookingId: "booking-1", venueName: "Auditorium", isMainVenue: true, status: "complete", ...overrides };
}

function equipmentRequirement(overrides: Partial<EquipmentRequirement> = {}): EquipmentRequirement {
  return {
    id: "req-1",
    equipmentItemId: "item-1",
    equipmentName: "Projector",
    category: "AV",
    quantity: 2,
    requiredFrom: null,
    requiredUntil: null,
    technicalRequirements: null,
    ...overrides,
  };
}

function equipmentReadiness(
  overrides: Partial<EquipmentRequirementReadiness> = {},
): EquipmentRequirementReadiness {
  return { requirementId: "req-1", equipmentName: "Projector", status: "complete", ...overrides };
}

describe("groupVenueBookingsByReadiness", () => {
  it("AC03: puts a complete booking in confirmed", () => {
    const result = groupVenueBookingsByReadiness([booking()], [venueReadiness()]);
    expect(result.confirmed.map((b) => b.id)).toEqual(["booking-1"]);
    expect(result.pendingOrNeedsReview).toEqual([]);
    expect(result.other).toEqual([]);
  });

  it("AC03: puts pending and needs_review bookings in pendingOrNeedsReview", () => {
    const pending = booking({ id: "booking-pending" });
    const needsReview = booking({ id: "booking-needs-review" });
    const result = groupVenueBookingsByReadiness(
      [pending, needsReview],
      [
        venueReadiness({ bookingId: "booking-pending", status: "pending" }),
        venueReadiness({ bookingId: "booking-needs-review", status: "needs_review" }),
      ],
    );
    expect(result.pendingOrNeedsReview.map((b) => b.id).sort()).toEqual([
      "booking-needs-review",
      "booking-pending",
    ]);
    expect(result.confirmed).toEqual([]);
  });

  it("AC05: a booking absent from readiness (rejected/cancelled/expired) goes to other with no readiness status", () => {
    const rejected = booking({ id: "booking-rejected", status: "rejected" });
    const result = groupVenueBookingsByReadiness([rejected], []);
    expect(result.other).toHaveLength(1);
    expect(result.other[0]?.readinessStatus).toBeNull();
    expect(result.confirmed).toEqual([]);
    expect(result.pendingOrNeedsReview).toEqual([]);
  });

  it("AC05: every booking passed in appears in exactly one group", () => {
    const bookings = [
      booking({ id: "a" }),
      booking({ id: "b" }),
      booking({ id: "c", status: "cancelled" }),
    ];
    const result = groupVenueBookingsByReadiness(bookings, [
      venueReadiness({ bookingId: "a", status: "complete" }),
      venueReadiness({ bookingId: "b", status: "pending" }),
    ]);
    const allIds = [...result.confirmed, ...result.pendingOrNeedsReview, ...result.other].map((b) => b.id);
    expect(allIds.sort()).toEqual(["a", "b", "c"]);
  });

  it("returns empty groups for no bookings", () => {
    expect(groupVenueBookingsByReadiness([], [])).toEqual({
      confirmed: [],
      pendingOrNeedsReview: [],
      other: [],
    });
  });
});

describe("groupEquipmentByReadiness", () => {
  it("AC01: puts a complete requirement in confirmed", () => {
    const result = groupEquipmentByReadiness([equipmentRequirement()], [equipmentReadiness()]);
    expect(result.confirmed.map((item) => item.id)).toEqual(["req-1"]);
    expect(result.pendingOrNeedsReview).toEqual([]);
  });

  it("AC03: puts pending and needs_review requirements in pendingOrNeedsReview", () => {
    const pending = equipmentRequirement({ id: "req-pending" });
    const needsReview = equipmentRequirement({ id: "req-needs-review" });
    const result = groupEquipmentByReadiness(
      [pending, needsReview],
      [
        equipmentReadiness({ requirementId: "req-pending", status: "pending" }),
        equipmentReadiness({ requirementId: "req-needs-review", status: "needs_review" }),
      ],
    );
    expect(result.pendingOrNeedsReview.map((item) => item.id).sort()).toEqual([
      "req-needs-review",
      "req-pending",
    ]);
  });

  it("defaults a requirement missing from readiness to pending rather than dropping it", () => {
    const result = groupEquipmentByReadiness([equipmentRequirement()], []);
    expect(result.pendingOrNeedsReview).toHaveLength(1);
    expect(result.pendingOrNeedsReview[0]?.readinessStatus).toBe("pending");
  });

  it("AC02: returns empty groups for no equipment requirements", () => {
    expect(groupEquipmentByReadiness([], [])).toEqual({ confirmed: [], pendingOrNeedsReview: [] });
  });
});
