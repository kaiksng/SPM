import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EventReadiness } from "@spm/shared";

import type { EventDetail } from "@/features/event-requests/services/event-details";
import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

import { ConfirmedArrangementsSection } from "./confirmed-arrangements-section";

function booking(overrides: Partial<VenueBookingRequestSummary> = {}): VenueBookingRequestSummary {
  return {
    id: "b-1", status: "approved", startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
    requestedAt: "2099-04-01T00:00:00.000Z", decidedAt: null, decisionNotes: null, expiresAt: null,
    venueId: "v-1", venueName: "Auditorium", venueLayouts: [], eventId: "e-1", eventTitle: "Career Fair",
    eventExpectedAttendance: 50,
    eventVenueRequirements: { preferredLocation: null, minimumCapacity: null, accessibilityNotes: null, layoutNotes: null, facilities: [] },
    requestedByName: "Priya", decidedByName: null, replacesBookingId: null,
    replacesVenueName: null, advisoryNotes: null, label: "Main Programme", expectedHeadcount: 50,
    isMainVenue: true, venueLocation: null, venueAreaTags: [], cancellationReason: null,
    cancelledAt: null, cancelledByName: null, mainDesignatedAt: null,
    ...overrides,
  };
}

function event(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: "e-1",
    title: "Career Fair",
    purpose: null,
    description: null,
    eventType: null,
    expectedAttendance: 50,
    startsAt: "2099-04-06T02:00:00.000Z",
    endsAt: "2099-04-06T04:00:00.000Z",
    status: "confirmed",
    submittedAt: null,
    organiserId: "org-1",
    organiserName: "Ravi",
    assignedCoordinatorId: "coord-1",
    assignedCoordinatorName: "Mei",
    venue: { preferredLocation: null, minimumCapacity: null, accessibilityNotes: null, layoutNotes: null, facilities: [] },
    equipment: [],
    registration: { required: false, opensAt: null, closesAt: null, capacity: null, waitlistEnabled: false, withdrawalPermitted: false },
    ...overrides,
  };
}

function readiness(overrides: Partial<EventReadiness> = {}): EventReadiness {
  return {
    ready: true,
    venues: [],
    venueArrangementStatus: "complete",
    equipment: [],
    equipmentArrangementStatus: "not_required",
    outstandingItems: [],
    ...overrides,
  };
}

describe("ConfirmedArrangementsSection", () => {
  it("AC01: shows a confirmed venue booking and its period under the Confirmed heading", () => {
    const main = booking();
    render(
      <ConfirmedArrangementsSection
        event={event()}
        bookings={[main]}
        readiness={readiness({
          venues: [
            { bookingId: "b-1", venueName: "Auditorium", isMainVenue: true, status: "complete", needsReviewReason: null },
          ],
        })}
      />,
    );

    const venueSection = screen.getByText("Confirmed", { selector: "h4" }).closest("div")!;
    expect(within(venueSection).getByText("Auditorium")).toBeInTheDocument();
    expect(within(venueSection).getByText("Main venue")).toBeInTheDocument();
  });

  // SPM-35 AC05: all of an event's venue bookings are listed, each with its
  // own period, not just the main venue's.
  it("AC05: lists every confirmed venue booking with its own period", () => {
    const main = booking({ id: "b-main", label: "Main Programme" });
    const breakout = booking({
      id: "b-breakout",
      label: "Breakout Room",
      venueName: "Breakout Hall",
      isMainVenue: false,
      startsAt: "2099-04-06T05:00:00.000Z",
      endsAt: "2099-04-06T06:00:00.000Z",
    });
    render(
      <ConfirmedArrangementsSection
        event={event()}
        bookings={[main, breakout]}
        readiness={readiness({
          venues: [
            { bookingId: "b-main", venueName: "Auditorium", isMainVenue: true, status: "complete", needsReviewReason: null },
            { bookingId: "b-breakout", venueName: "Breakout Room", isMainVenue: false, status: "complete", needsReviewReason: null },
          ],
        })}
      />,
    );

    const venueSection = screen.getByText("Confirmed", { selector: "h4" }).closest("div")!;
    const mainRow = within(venueSection).getByText("Main Programme").closest("li")!;
    const breakoutRow = within(venueSection).getByText("Breakout Room").closest("li")!;
    expect(mainRow).not.toBe(breakoutRow);
    expect(within(mainRow).getByText("Auditorium")).toBeInTheDocument();
    expect(within(breakoutRow).getByText("Breakout Hall")).toBeInTheDocument();
    const mainPeriod = within(mainRow).getByText(/Apr 2099/).textContent;
    const breakoutPeriod = within(breakoutRow).getByText(/Apr 2099/).textContent;
    expect(mainPeriod).toBeTruthy();
    expect(breakoutPeriod).toBeTruthy();
    expect(mainPeriod).not.toEqual(breakoutPeriod);
  });

  it("AC02: shows Not Required instead of an empty equipment list", () => {
    render(
      <ConfirmedArrangementsSection
        event={event({ equipment: [] })}
        bookings={[]}
        readiness={readiness({ equipmentArrangementStatus: "not_required" })}
      />,
    );

    expect(screen.getByText("Not Required")).toBeInTheDocument();
  });

  it("AC03: separates a Needs Review booking from Confirmed ones under their own heading", () => {
    const confirmedBooking = booking({ id: "b-confirmed" });
    const needsReviewBooking = booking({ id: "b-needs-review", isMainVenue: false, label: "Breakout Room" });
    render(
      <ConfirmedArrangementsSection
        event={event()}
        bookings={[confirmedBooking, needsReviewBooking]}
        readiness={readiness({
          venues: [
            { bookingId: "b-confirmed", venueName: "Auditorium", isMainVenue: true, status: "complete", needsReviewReason: null },
            { bookingId: "b-needs-review", venueName: "Breakout Room", isMainVenue: false, status: "needs_review", needsReviewReason: "Flagged during the safety review." },
          ],
        })}
      />,
    );

    const pendingHeading = screen.getByText("Pending / Needs Review", { selector: "h4" });
    const pendingGroup = pendingHeading.closest("div")!;
    expect(within(pendingGroup).getByText("Breakout Room")).toBeInTheDocument();

    const confirmedHeading = screen.getByText("Confirmed", { selector: "h4" });
    const confirmedGroup = confirmedHeading.closest("div")!;
    expect(within(confirmedGroup).queryByText("Breakout Room")).not.toBeInTheDocument();
  });

  it("AC05: a booking absent from readiness (e.g. rejected) still appears, in the Other group", () => {
    const rejectedBooking = booking({ id: "b-rejected", status: "rejected", isMainVenue: false, label: "Old Hall" });
    render(
      <ConfirmedArrangementsSection event={event()} bookings={[rejectedBooking]} readiness={readiness()} />,
    );

    const otherHeading = screen.getByText("Other", { selector: "h4" });
    expect(within(otherHeading.closest("div")!).getByText("Old Hall")).toBeInTheDocument();
  });

  // SPM-46 AC05: completing the event releases its equipment, which readiness
  // no longer counts as reserved; on a Completed event it still reads as
  // confirmed.
  it("keeps a Completed event's equipment under Confirmed", () => {
    render(
      <ConfirmedArrangementsSection
        event={event({
          status: "completed",
          equipment: [
            {
              id: "req-1", equipmentItemId: "item-1", equipmentName: "Projector", category: "Visual",
              quantity: 2, requiredFrom: null, requiredUntil: null, technicalRequirements: null,
              requestedAt: "2099-01-01T00:00:00Z",
            },
          ],
        })}
        bookings={[]}
        readiness={readiness({ equipment: [], equipmentArrangementStatus: "pending" })}
      />,
    );

    const equipmentConfirmed = screen.getByText("Confirmed", { selector: "h4" }).closest("div")!;
    expect(within(equipmentConfirmed).getByText("Projector × 2")).toBeInTheDocument();
    expect(screen.queryByText("Pending / Needs Review", { selector: "h4" })).not.toBeInTheDocument();
  });
});
