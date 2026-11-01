import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

import { VenueConflictSection } from "./venue-conflict-section";

const booking = {
  id: "b-1", venueName: "SMU Connex", startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
} as VenueBookingRequestSummary;

const blockConflict = {
  bookingId: "b-1", mustMove: true, conflictingEventTitle: null, conflictingStartsAt: null, conflictingEndsAt: null,
  blockReason: "Failed mic", blockStartsAt: "2099-04-06T03:00:00.000Z", blockEndsAt: "2099-04-06T03:30:00.000Z",
  flaggedAt: "2099-04-02T00:00:00.000Z",
};

describe("VenueConflictSection", () => {
  // 202611010015: a booking over a venue block always has to move.
  it("names the venue block the booking overlaps and asks for a replacement", () => {
    render(<VenueConflictSection booking={booking} conflict={blockConflict} replacementRequested={false} />);

    expect(screen.getByRole("region", { name: "Venue conflict" })).toBeInTheDocument();
    expect(screen.getByText("Replacement Required")).toBeInTheDocument();
    expect(screen.getByText(/Overlaps the venue block "Failed mic" \(6 Apr 2099, 11:00 am – 6 Apr 2099, 11:30 am\)/))
      .toBeInTheDocument();
    expect(screen.getByText(/Choose a different venue for the same period below/)).toBeInTheDocument();
  });

  it("says the booking stays while its replacement is awaiting a decision", () => {
    render(<VenueConflictSection booking={booking} conflict={blockConflict} replacementRequested />);

    expect(screen.getByText("Replacement Requested")).toBeInTheDocument();
    expect(screen.getByText(/stays until Venue Staff approve it/)).toBeInTheDocument();
  });
});
