import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

import { EventVenueBookings } from "./event-venue-bookings";

const onWithdraw = vi.fn();
const onConfirmHold = vi.fn();
const onSetMain = vi.fn();

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

function booking(overrides: Partial<VenueBookingRequestSummary> = {}): VenueBookingRequestSummary {
  return {
    id: "b-1", status: "pending", startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
    requestedAt: "2099-04-01T00:00:00.000Z", decidedAt: null, decisionNotes: null, expiresAt: null,
    venueId: "v-1", venueName: "Room 2.01", venueLayouts: [], eventId: "e-1", eventTitle: "Conference",
    eventExpectedAttendance: 300,
    eventVenueRequirements: { preferredLocation: null, minimumCapacity: null, accessibilityNotes: null, layoutNotes: null, facilities: [] },
    requestedByName: "Priya", decidedByName: null, replacesBookingId: null,
    replacesVenueName: null, advisoryNotes: null, label: "Main Programme", expectedHeadcount: 40,
    isMainVenue: true, venueLocation: "Marina Bay", venueAreaTags: [], cancellationReason: null,
    cancelledAt: null, cancelledByName: null, mainDesignatedAt: null,
    ...overrides,
  };
}

// Venue Staff put the request on hold until 10:00 SGT on 5 Apr 2099.
const onHold = booking({ status: "on_hold", expiresAt: "2099-04-05T02:00:00.000Z" });

function renderBookings(
  bookings: VenueBookingRequestSummary[],
  props: Partial<{ busyBookingId: string; actionError: { bookingId: string; message: string } }> = {},
) {
  return render(
    <EventVenueBookings
      bookings={bookings}
      canChangeMain
      onWithdraw={onWithdraw}
      onConfirmHold={onConfirmHold}
      onSetMain={onSetMain}
      {...props}
    />,
  );
}

beforeEach(() => {
  onWithdraw.mockReset().mockResolvedValue(undefined);
  onConfirmHold.mockReset();
  onSetMain.mockReset();
});

describe("EventVenueBookings: a booking request on hold", () => {
  it("AC01: shows the On Hold status, the confirmation deadline and a Confirm request option", () => {
    renderBookings([onHold]);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("On Hold")).toBeInTheDocument();
    expect(item).toHaveTextContent(
      `Confirm by ${dateTimeFormatter.format(new Date("2099-04-05T02:00:00.000Z"))}`,
    );
    expect(within(item).getByRole("button", { name: "Confirm request" })).toBeEnabled();
  });

  it("AC02: confirming sends that booking's id", async () => {
    const user = userEvent.setup();
    renderBookings([booking({ id: "other", status: "pending", isMainVenue: false, label: "Breakout 1" }), onHold]);

    await user.click(screen.getByRole("button", { name: "Confirm request" }));

    expect(onConfirmHold).toHaveBeenCalledTimes(1);
    expect(onConfirmHold).toHaveBeenCalledWith("b-1");
  });

  it("AC02: shows the request is being confirmed and blocks a second click", () => {
    renderBookings([onHold], { busyBookingId: "b-1" });

    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Confirm request" })).not.toBeInTheDocument();
  });

  it("AC02: shows why a confirmation was refused, on that booking", () => {
    renderBookings([onHold], {
      actionError: { bookingId: "b-1", message: "This hold has expired. Submit a new venue booking request." },
    });

    expect(within(screen.getByRole("listitem")).getByRole("alert")).toHaveTextContent(
      "This hold has expired. Submit a new venue booking request.",
    );
  });

  it("offers Confirm request only for a booking on hold", () => {
    renderBookings([
      booking({ id: "p", status: "pending" }),
      booking({ id: "a", status: "approved", isMainVenue: false, label: "Breakout 1" }),
      booking({ id: "x", status: "expired", expiresAt: "2099-04-05T02:00:00.000Z", label: "Breakout 2" }),
    ]);

    expect(screen.queryByRole("button", { name: "Confirm request" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Confirm by/)).not.toBeInTheDocument();
  });

  it("AC03: an expired hold can no longer be confirmed and tells the coordinator the venue is free again", () => {
    renderBookings([booking({ status: "expired", expiresAt: "2099-04-05T02:00:00.000Z" })]);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Expired")).toBeInTheDocument();
    expect(item).toHaveTextContent("This hold expired before it was confirmed. The venue is available again");
    expect(within(item).queryByRole("button", { name: "Confirm request" })).not.toBeInTheDocument();
  });
});
