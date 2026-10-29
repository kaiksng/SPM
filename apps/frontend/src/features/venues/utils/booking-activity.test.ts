import { describe, expect, it } from "vitest";

import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

import { buildBookingActivity } from "./booking-activity";

function booking(overrides: Partial<VenueBookingRequestSummary> = {}): VenueBookingRequestSummary {
  return {
    id: "b-1", status: "pending", startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
    requestedAt: "2099-04-01T00:00:00.000Z", decidedAt: null, decisionNotes: null, expiresAt: null,
    venueId: "v-1", venueName: "Room 2.01", venueLayouts: [], eventId: "e-1", eventTitle: "Conference",
    eventExpectedAttendance: 300,
    eventVenueRequirements: { preferredLocation: null, minimumCapacity: null, accessibilityNotes: null, layoutNotes: null, facilities: [] },
    requestedByName: "Priya", decidedByName: null, replacesBookingId: null,
    replacesVenueName: null, advisoryNotes: null, label: "Breakout 1", expectedHeadcount: 40,
    isMainVenue: false, venueLocation: "Marina Bay", venueAreaTags: [], cancellationReason: null,
    cancelledAt: null, cancelledByName: null, mainDesignatedAt: null,
    ...overrides,
  };
}

describe("buildBookingActivity", () => {
  it("AC12: logs a request with who asked, the headcount and the booking's label", () => {
    const [entry] = buildBookingActivity([booking()]);

    expect(entry).toMatchObject({ kind: "requested", title: "Requested", label: "Breakout 1", actor: "Priya", detail: "40 people" });
  });

  it("logs a rejection with who rejected it and the reason", () => {
    const entries = buildBookingActivity([
      booking({ status: "rejected", decidedAt: "2099-04-02T00:00:00.000Z", decidedByName: "Sam", decisionNotes: "Room reserved" }),
    ]);

    expect(entries[0]).toMatchObject({ kind: "rejected", actor: "Sam", detail: "Room reserved" });
  });

  it("tells a withdrawn Pending booking from a cancelled Approved one", () => {
    const withdrawn = buildBookingActivity([
      booking({ status: "cancelled", cancelledAt: "2099-04-02T00:00:00.000Z", cancelledByName: "Priya", cancellationReason: "Not needed" }),
    ]);
    const cancelled = buildBookingActivity([
      booking({ status: "cancelled", decidedAt: "2099-04-02T00:00:00.000Z", cancelledAt: "2099-04-03T00:00:00.000Z", cancelledByName: "Priya", cancellationReason: "Moved" }),
    ]);

    expect(withdrawn[0]).toMatchObject({ kind: "withdrawn", detail: "Not needed" });
    expect(cancelled[0]).toMatchObject({ kind: "cancelled", detail: "Moved" });
  });

  it("orders entries newest first", () => {
    const entries = buildBookingActivity([
      booking({ status: "approved", decidedAt: "2099-04-02T00:00:00.000Z", decidedByName: "Sam" }),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(["approved", "requested"]);
  });

  it("logs when a booking became main, but not for the first booking", () => {
    const first = buildBookingActivity([booking({ mainDesignatedAt: "2099-04-01T00:00:00.000Z" })]);
    const moved = buildBookingActivity([booking({ mainDesignatedAt: "2099-04-05T00:00:00.000Z" })]);

    expect(first.map((entry) => entry.kind)).toEqual(["requested"]);
    expect(moved.map((entry) => entry.kind)).toEqual(["main", "requested"]);
  });

  it("links a replacement to the booking it replaces, only once it is requested or approved", () => {
    const original = booking({ id: "orig", status: "approved", venueName: "Auditorium" });
    const replacement = booking({
      id: "repl", venueName: "Grand Hall", replacesBookingId: "orig", replacesVenueName: "Auditorium",
      requestedAt: "2099-04-02T00:00:00.000Z",
    });

    const pending = buildBookingActivity([original, replacement]);
    expect(pending.find((entry) => entry.kind === "replacement_requested")?.detail).toBe("Replacement requested at Grand Hall");

    const approved = buildBookingActivity([original, { ...replacement, status: "approved", decidedAt: "2099-04-03T00:00:00.000Z" }]);
    expect(approved.find((entry) => entry.kind === "replaced")?.detail).toBe("Replaced by the booking at Grand Hall");

    const rejected = buildBookingActivity([original, { ...replacement, status: "rejected" }]);
    expect(rejected.some((entry) => entry.kind === "replaced" || entry.kind === "replacement_requested")).toBe(false);
  });

  it("AC04 (venue hold): logs an expired hold at its deadline, without a decision", () => {
    const entries = buildBookingActivity([
      booking({ status: "expired", expiresAt: "2099-04-05T02:00:00.000Z" }),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(["hold_expired", "requested"]);
    expect(entries[0]).toMatchObject({
      id: "b-1-hold-expired", title: "Hold expired", at: "2099-04-05T02:00:00.000Z",
      label: "Breakout 1", venueName: "Room 2.01", actor: null,
    });
  });

  it("does not log a hold that is still running as expired", () => {
    const entries = buildBookingActivity([
      booking({ status: "on_hold", expiresAt: "2099-04-05T02:00:00.000Z" }),
    ]);

    expect(entries.map((entry) => entry.kind)).toEqual(["requested"]);
  });

  it("logs a disruption only for a booking in the list", () => {
    const entries = buildBookingActivity([booking()], [
      { bookingId: "b-1", flaggedAt: "2099-04-04T00:00:00.000Z" },
      { bookingId: "elsewhere", flaggedAt: "2099-04-04T00:00:00.000Z" },
    ]);

    expect(entries.filter((entry) => entry.kind === "disrupted")).toHaveLength(1);
  });
});

describe("buildBookingActivity request details", () => {
  // SPM-82 AC08 / SPM-85 AC12: a replacement request says which disrupted booking it replaces, and where it was.
  it("describes a replacement for a disrupted booking, with or without the original venue", () => {
    const named = buildBookingActivity([booking({ replacesBookingId: "b-0", replacesVenueName: "Auditorium" })]);
    const unnamed = buildBookingActivity([booking({ replacesBookingId: "b-0", replacesVenueName: null })]);

    expect(named[0]?.detail).toBe("Replacement for the disrupted booking at Auditorium · 40 people");
    expect(unnamed[0]?.detail).toBe("Replacement for the disrupted booking · 40 people");
  });

  it("leaves the detail empty when there is no headcount and nothing is replaced", () => {
    const [entry] = buildBookingActivity([booking({ expectedHeadcount: null })]);

    expect(entry?.detail).toBeNull();
  });
});

