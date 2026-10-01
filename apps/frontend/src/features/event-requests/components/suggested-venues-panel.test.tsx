import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listSuggestedVenuesMock = vi.fn();
const searchAvailableVenuesMock = vi.fn();

vi.mock("@/features/venues/services/venues", () => ({
  listSuggestedVenues: (...args: unknown[]) => listSuggestedVenuesMock(...args),
  VENUE_AVAILABILITY_LABELS: {
    available: "Available",
    pending: "Pending",
    confirmed: "Confirmed",
    blocked: "Blocked",
  },
}));
vi.mock("@/features/venues/services/venue-search", () => ({
  searchAvailableVenues: (...args: unknown[]) => searchAvailableVenuesMock(...args),
}));

import { SuggestedVenuesPanel } from "./suggested-venues-panel";
import type { EventDetail } from "@/features/event-requests/services/event-details";

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
  const event: EventDetail = {
    id: "event-1", title: "Planning event", purpose: null, description: null,
    eventType: null, expectedAttendance: 20,
    startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
    status: "planning", submittedAt: null, organiserId: "organiser-1",
    organiserName: null, assignedCoordinatorId: "coordinator-1",
    assignedCoordinatorName: null,
    venue: { preferredLocation: "", minimumCapacity: 30, accessibilityNotes: "", layoutNotes: "", facilities: [] },
    equipment: [], registration: { required: false, opensAt: null, closesAt: null, capacity: null, waitlistEnabled: false },
  };
  return render(
    <MemoryRouter>
      <SuggestedVenuesPanel event={event} hasActiveBooking={false} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listSuggestedVenuesMock.mockReset().mockResolvedValue([venue]);
  searchAvailableVenuesMock.mockReset().mockResolvedValue([venue, otherVenue]);
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

  it("opens manual filters prefilled from the event", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("Conference Room A");
    await user.click(screen.getByRole("button", { name: "Search venues" }));
    expect(screen.getByLabelText("Minimum capacity *")).toHaveValue(30);
    expect(searchAvailableVenuesMock).not.toHaveBeenCalled();
  });

  it("searches available venues using the coordinator's filters", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Search venues" }));
    await user.selectOptions(screen.getByLabelText("Location"), "Bugis");
    await user.click(screen.getByRole("button", { name: "Search venues" }));
    expect(searchAvailableVenuesMock).toHaveBeenCalledWith("event-1", expect.objectContaining({ location: "Bugis", minimumCapacity: "30" }));
    expect(await screen.findByRole("heading", { name: "Auditorium" })).toBeInTheDocument();
  });

  it("shows a clear empty result and keeps search inputs editable", async () => {
    searchAvailableVenuesMock.mockResolvedValue([]);
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Search venues" }));
    await user.click(screen.getByRole("button", { name: "Search venues" }));
    expect(await screen.findByText("No matching venue was found.")).toBeInTheDocument();
    expect(screen.getByLabelText("Minimum capacity *")).toHaveValue(30);
  });

  it("makes results for changed dates review-only", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Search venues" }));
    fireEvent.change(screen.getByLabelText("Start date and time *"), { target: { value: "2099-04-07T10:00" } });
    fireEvent.change(screen.getByLabelText("End date and time *"), { target: { value: "2099-04-07T12:00" } });
    await user.click(screen.getByRole("button", { name: "Search venues" }));
    expect(await screen.findByRole("heading", { name: "Auditorium" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "View details" })[0]).toHaveAttribute("href", expect.stringContaining("explore=1"));
  });

  it("returns to suggested venues when Back to suggested venues is clicked", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Search venues" }));

    await user.click(screen.getByRole("button", { name: "Back to suggested venues" }));

    expect(screen.getByText("Suggested venues")).toBeInTheDocument();
    expect(screen.queryByText("Auditorium")).not.toBeInTheDocument();
  });
});
