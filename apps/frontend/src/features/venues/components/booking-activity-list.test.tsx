import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { BookingActivityEntry } from "@/features/venues/utils/booking-activity";

import { BookingActivityList } from "./booking-activity-list";

function entry(overrides: Partial<BookingActivityEntry> = {}): BookingActivityEntry {
  return {
    id: "b-1-requested", at: "2099-04-01T02:00:00.000Z", kind: "requested", title: "Requested", bookingId: "b-1",
    label: "Breakout 1", venueName: "Cedar Room", eventId: "e-1", eventTitle: "Conference", actor: "Priya", detail: "40 people",
    ...overrides,
  };
}

// SPM-85 AC12: a venue's or an event's activity log shows what happened to each booking, newest first.
describe("BookingActivityList", () => {
  it("says so when nothing has happened yet", () => {
    render(<BookingActivityList entries={[]} emptyText="No bookings have been requested at this venue yet." />);

    expect(screen.getByText("No bookings have been requested at this venue yet.")).toBeInTheDocument();
  });

  it("names the booking, its venue, the step, who did it and a plain detail", () => {
    render(<BookingActivityList entries={[entry()]} emptyText="none" />);

    expect(screen.getByText("Breakout 1")).toBeInTheDocument();
    expect(screen.getByText("Cedar Room")).toBeInTheDocument();
    expect(screen.getByText("Requested")).toBeInTheDocument();
    expect(screen.getByText("by Priya")).toBeInTheDocument();
    expect(screen.getByText("40 people")).toBeInTheDocument();
    expect(screen.queryByText("Conference")).not.toBeInTheDocument();
  });

  it("also names the event when it is a venue's activity", () => {
    render(<BookingActivityList entries={[entry()]} showEvent emptyText="none" />);

    expect(screen.getByText("Conference")).toBeInTheDocument();
  });

  it("quotes the reason for a rejection, withdrawal or cancellation and the notes for an approval", () => {
    render(
      <BookingActivityList
        emptyText="none"
        entries={[
          entry({ id: "1", kind: "rejected", title: "Rejected", detail: "Room reserved" }),
          entry({ id: "2", kind: "withdrawn", title: "Withdrawn", detail: "Not needed" }),
          entry({ id: "3", kind: "cancelled", title: "Cancelled", detail: "Moved" }),
          entry({ id: "4", kind: "approved", title: "Approved", detail: "Fits the event" }),
        ]}
      />,
    );

    expect(screen.getByText('Reason: "Room reserved"')).toBeInTheDocument();
    expect(screen.getByText('Reason: "Not needed"')).toBeInTheDocument();
    expect(screen.getByText('Reason: "Moved"')).toBeInTheDocument();
    expect(screen.getByText('Notes: "Fits the event"')).toBeInTheDocument();
  });

  it("shows no actor or detail when there is none", () => {
    render(<BookingActivityList entries={[entry({ actor: null, detail: null })]} emptyText="none" />);

    expect(screen.queryByText(/^by /)).not.toBeInTheDocument();
    expect(screen.queryByText("40 people")).not.toBeInTheDocument();
  });
});
