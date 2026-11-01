import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EventVenueConflict } from "@/features/venues/services/event-venue-conflicts";
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
  props: Partial<{
    busyBookingId: string;
    actionError: { bookingId: string; message: string };
    conflicts: EventVenueConflict[];
    disruptedBookingId: string;
  }> = {},
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
  it("SPM-75 AC01: shows the On Hold status, the confirmation deadline and a Confirm request option", () => {
    renderBookings([onHold]);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("On Hold")).toBeInTheDocument();
    expect(item).toHaveTextContent(
      `Confirm by ${dateTimeFormatter.format(new Date("2099-04-05T02:00:00.000Z"))}`,
    );
    expect(within(item).getByRole("button", { name: "Confirm request" })).toBeEnabled();
  });

  it("SPM-75 AC02: confirming sends that booking's id", async () => {
    const user = userEvent.setup();
    renderBookings([booking({ id: "other", status: "pending", isMainVenue: false, label: "Breakout 1" }), onHold]);

    await user.click(screen.getByRole("button", { name: "Confirm request" }));

    expect(onConfirmHold).toHaveBeenCalledTimes(1);
    expect(onConfirmHold).toHaveBeenCalledWith("b-1");
  });

  it("SPM-75 AC02: shows the request is being confirmed and blocks a second click", () => {
    renderBookings([onHold], { busyBookingId: "b-1" });

    expect(screen.getByRole("button", { name: "Confirming…" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Confirm request" })).not.toBeInTheDocument();
  });

  it("SPM-75 AC02: shows why a confirmation was refused, on that booking", () => {
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

  it("SPM-75 AC03: an expired hold can no longer be confirmed and tells the coordinator the venue is free again", () => {
    renderBookings([booking({ status: "expired", expiresAt: "2099-04-05T02:00:00.000Z" })]);

    const item = screen.getByRole("listitem");
    expect(within(item).getByText("Expired")).toBeInTheDocument();
    expect(item).toHaveTextContent("This hold expired before it was confirmed. The venue is available again");
    expect(within(item).queryByRole("button", { name: "Confirm request" })).not.toBeInTheDocument();
  });
});

// SPM-85 AC11: the coordinator releases one booking at a time, always giving a reason.
describe("EventVenueBookings: releasing a booking", () => {
  it("withdraws a Pending booking after a reason is given, then closes the dialog", async () => {
    const user = userEvent.setup();
    renderBookings([booking()]);

    await user.click(screen.getByRole("button", { name: "Withdraw request" }));
    const dialog = screen.getByRole("dialog", { name: "Withdraw request: Main Programme" });
    await user.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Give a reason for withdrawing or cancelling this venue booking.");
    expect(onWithdraw).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Reason"), "  Moving to another room ");
    await user.click(within(dialog).getByRole("button", { name: "Confirm withdrawal" }));

    await waitFor(() => expect(onWithdraw).toHaveBeenCalledWith("b-1", "Moving to another room"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("cancels an Approved booking, and keeps it when the coordinator changes their mind", async () => {
    const user = userEvent.setup();
    renderBookings([booking({ status: "approved" })]);

    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    expect(screen.getByRole("dialog", { name: "Cancel confirmed booking: Main Programme" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep booking" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onWithdraw).not.toHaveBeenCalled();
  });

  it("shows why a booking could not be released, with a plain message when none is given", async () => {
    const user = userEvent.setup();
    onWithdraw.mockRejectedValueOnce(new Error("A replacement is pending for this booking"));
    renderBookings([booking({ status: "approved" })]);

    await user.click(screen.getByRole("button", { name: "Cancel booking" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "Not needed");
    await user.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("A replacement is pending for this booking");

    onWithdraw.mockRejectedValueOnce("boom");
    await user.click(within(dialog).getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("This booking could not be released."));
  });
});

// SPM-85: a rejected booking stays visible with what is known about who rejected it, when, and why.
describe("EventVenueBookings: a rejected booking", () => {
  it("shows who rejected it, when, and the reason", () => {
    renderBookings([booking({ status: "rejected", decidedByName: "Sam", decidedAt: "2099-04-02T02:00:00.000Z", decisionNotes: "Room reserved" })]);

    expect(screen.getByText(`Rejected by Sam on ${dateTimeFormatter.format(new Date("2099-04-02T02:00:00.000Z"))}.`)).toBeInTheDocument();
    expect(screen.getByText(/Reason: Room reserved/)).toBeInTheDocument();
  });

  it("shows only what is known when the decision has no name, time or reason", () => {
    renderBookings([booking({ status: "rejected" })]);

    expect(screen.getByText("Rejected.")).toBeInTheDocument();
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });
});

function conflict(overrides: Partial<EventVenueConflict> = {}): EventVenueConflict {
  return {
    bookingId: "b-1", mustMove: true, conflictingEventTitle: "F1 Event Part 1",
    conflictingStartsAt: "2099-04-06T00:00:00.000Z", conflictingEndsAt: "2099-04-06T01:45:00.000Z",
    blockReason: null, blockStartsAt: null, blockEndsAt: null, flaggedAt: "2099-04-02T00:00:00.000Z",
    ...overrides,
  };
}

// 202611010013: of two overlapping bookings the later one moves and the one
// booked first stays; a booking overlapping a venue block always moves.
describe("EventVenueBookings: a venue conflict", () => {
  const approved = booking({ status: "approved" });

  it("keeps a booking that has to move until its replacement is approved", () => {
    renderBookings([approved], { conflicts: [conflict()] });

    expect(screen.getByText("Venue issue")).toBeInTheDocument();
    expect(screen.getByText(/This venue clashes with another booking\. The booking stays until its replacement is approved/))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
  });

  it("offers no Withdraw request on a pending booking that has to move", () => {
    renderBookings([booking({ status: "pending" })], { conflicts: [conflict()] });

    expect(screen.queryByRole("button", { name: "Withdraw request" })).not.toBeInTheDocument();
  });

  it("tells the coordinator of the booking made first that no action is needed", () => {
    renderBookings([approved], {
      conflicts: [conflict({ mustMove: false, conflictingEventTitle: "F1 Event Part 2" })],
    });

    expect(screen.queryByText("Venue issue")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/That booking was made later, so it is the one expected to move\. No action is needed from you\./))
      .toBeInTheDocument();
  });

  it("shows nothing for a booking that is no longer active", () => {
    renderBookings([booking({ status: "cancelled" })], { conflicts: [conflict()] });

    expect(screen.queryByText("Venue issue")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// SPM-82/83: a booking whose venue became unavailable is kept until its
// replacement is approved, so it can't be cancelled or withdrawn by hand.
describe("EventVenueBookings: a disrupted booking", () => {
  it("offers no Cancel booking on the disrupted booking, and says why", () => {
    renderBookings([booking({ status: "approved" })], { disruptedBookingId: "b-1" });

    expect(screen.queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();
    expect(screen.getByText(/stays until its replacement is approved/)).toBeInTheDocument();
  });

  it("offers no Withdraw request on a disrupted pending booking", () => {
    renderBookings([booking({ status: "pending" })], { disruptedBookingId: "b-1" });

    expect(screen.queryByRole("button", { name: "Withdraw request" })).not.toBeInTheDocument();
  });

  it("still lets the event's other bookings be cancelled", () => {
    renderBookings(
      [
        booking({ status: "approved" }),
        booking({ id: "b-2", status: "approved", isMainVenue: false, label: "Breakout", venueName: "Room 2.02" }),
      ],
      { disruptedBookingId: "b-1" },
    );

    expect(screen.getAllByRole("button", { name: "Cancel booking" })).toHaveLength(1);
  });
});
