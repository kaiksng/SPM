import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listSuggestedVenuesMock = vi.fn();
const listVenuesMock = vi.fn();

vi.mock("@/features/venues/services/venues", () => ({
  listSuggestedVenues: (...args: unknown[]) => listSuggestedVenuesMock(...args),
  listVenues: (...args: unknown[]) => listVenuesMock(...args),
  VENUE_AVAILABILITY_LABELS: {
    available: "Available",
    pending: "Pending",
    confirmed: "Confirmed",
    blocked: "Blocked",
  },
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

const otherVenue = {
  ...venue,
  id: "venue-2",
  name: "Auditorium",
  location: "Building 2",
};

function renderPanel() {
  return render(
    <MemoryRouter>
      <SuggestedVenuesPanel eventId="event-1" />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listSuggestedVenuesMock.mockReset().mockResolvedValue([venue]);
  listVenuesMock.mockReset().mockResolvedValue([venue, otherVenue]);
});

describe("SuggestedVenuesPanel", () => {
  it("lists matching venues for the event", async () => {
    renderPanel();

    expect(await screen.findByText("Conference Room A")).toBeInTheDocument();
    expect(listSuggestedVenuesMock).toHaveBeenCalledWith("event-1");
  });

  it("links View details to the venue's detail page for this event", async () => {
    renderPanel();

    await screen.findByText("Conference Room A");
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/venues/venue-1?forEvent=event-1",
    );
  });

  it("tags an available venue as Available", async () => {
    listSuggestedVenuesMock.mockResolvedValue([{ ...venue, availabilityStatus: "available" }]);
    renderPanel();

    expect(await screen.findByText("Conference Room A")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("tags a matching but unavailable venue instead of hiding it", async () => {
    listSuggestedVenuesMock.mockResolvedValue([{ ...venue, availabilityStatus: "confirmed" }]);
    renderPanel();

    expect(await screen.findByText("Conference Room A")).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/venues/venue-1?forEvent=event-1&status=confirmed",
    );
  });

  it("shows an empty state when no venue matches", async () => {
    listSuggestedVenuesMock.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText("No matching venues")).toBeInTheDocument();
  });

  it("switches to the full venue catalogue when Manual search is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Conference Room A");
    await user.click(screen.getByRole("button", { name: "Manual search" }));

    expect(listVenuesMock).toHaveBeenCalled();
    expect(await screen.findByText("Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Conference Room A")).toBeInTheDocument();
  });

  it("filters manual search results by name or location", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Manual search" }));
    await screen.findByText("Auditorium");

    await user.type(screen.getByPlaceholderText("Search by venue name or location"), "Building 2");

    expect(screen.getByText("Auditorium")).toBeInTheDocument();
    expect(screen.queryByText("Conference Room A")).not.toBeInTheDocument();
  });

  it("returns to suggested venues when Back to suggested venues is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Manual search" }));
    await screen.findByText("Auditorium");

    await user.click(screen.getByRole("button", { name: "Back to suggested venues" }));

    expect(screen.getByText("Suggested venues")).toBeInTheDocument();
    expect(screen.queryByText("Auditorium")).not.toBeInTheDocument();
  });
});
