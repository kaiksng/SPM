import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listSuggestedVenuesMock = vi.fn();
const submitVenueBookingRequestMock = vi.fn();

vi.mock("@/features/venues/services/venues", () => ({
  listSuggestedVenues: (...args: unknown[]) => listSuggestedVenuesMock(...args),
}));

vi.mock("@/features/venues/services/venue-bookings", () => ({
  submitVenueBookingRequest: (...args: unknown[]) => submitVenueBookingRequestMock(...args),
}));

import { SuggestedVenuesPanel } from "./suggested-venues-panel";

const venue = {
  id: "venue-1",
  name: "Conference Room A",
  location: "Building 1",
  capacity: 40,
  operatingHours: [{ days: ["mon", "tue", "wed", "thu", "fri"], opensAt: "08:00", closesAt: "18:00" }],
  description: null,
  accessibilityNotes: null,
  facilities: ["Projector"],
  layouts: ["Theatre"],
  updatedAt: "2026-09-20T00:00:00.000Z",
  updatedByName: null,
  needsReviewCount: 0,
};

beforeEach(() => {
  listSuggestedVenuesMock.mockReset().mockResolvedValue([venue]);
  submitVenueBookingRequestMock.mockReset().mockResolvedValue("booking-1");
});

describe("SuggestedVenuesPanel", () => {
  it("lists matching venues for the event", async () => {
    render(<SuggestedVenuesPanel eventId="event-1" onBooked={vi.fn()} />);

    expect(await screen.findByText("Conference Room A")).toBeInTheDocument();
    expect(listSuggestedVenuesMock).toHaveBeenCalledWith("event-1");
  });

  it("submits a venue booking request when Select venue is clicked, then calls onBooked", async () => {
    const onBooked = vi.fn();
    const user = userEvent.setup();
    render(<SuggestedVenuesPanel eventId="event-1" onBooked={onBooked} />);

    await user.click(await screen.findByRole("button", { name: "Select venue" }));

    await waitFor(() => {
      expect(submitVenueBookingRequestMock).toHaveBeenCalledWith("event-1", "venue-1");
    });
    expect(onBooked).toHaveBeenCalled();
  });

  it("shows the specific error identifying why submission failed, without calling onBooked", async () => {
    submitVenueBookingRequestMock.mockRejectedValue(
      new Error("This event already has an active venue booking request"),
    );
    const onBooked = vi.fn();
    const user = userEvent.setup();
    render(<SuggestedVenuesPanel eventId="event-1" onBooked={onBooked} />);

    await user.click(await screen.findByRole("button", { name: "Select venue" }));

    expect(
      await screen.findByText("This event already has an active venue booking request"),
    ).toBeInTheDocument();
    expect(onBooked).not.toHaveBeenCalled();
  });

  it("shows an empty state when no venue matches", async () => {
    listSuggestedVenuesMock.mockResolvedValue([]);
    render(<SuggestedVenuesPanel eventId="event-1" onBooked={vi.fn()} />);

    expect(await screen.findByText("No matching venues")).toBeInTheDocument();
  });
});
