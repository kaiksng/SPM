import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderPanel(replacing?: { bookingId: string; venueId: string }) {
  const event: EventDetail = {
    id: "event-1", title: "Planning event", purpose: null, description: null,
    eventType: null, expectedAttendance: 20,
    startsAt: "2099-04-06T02:00:00.000Z", endsAt: "2099-04-06T04:00:00.000Z",
    status: "planning", submittedAt: null, organiserId: "organiser-1",
    organiserName: null, assignedCoordinatorId: "coordinator-1",
    assignedCoordinatorName: null,
    venue: { preferredLocation: "", minimumCapacity: 30, accessibilityNotes: "", layoutNotes: "", facilities: [] },
    equipment: [], registration: { required: false, opensAt: null, closesAt: null, capacity: null, waitlistEnabled: false, withdrawalPermitted: false },
  };
  return render(
    <MemoryRouter>
      <SuggestedVenuesPanel event={event} hasActiveBooking={false} replacing={replacing} />
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

  // SPM-82 AC02: the disrupted venue is not offered as its own replacement, and
  // each result carries the booking being replaced into the venue page.
  describe("replacing a disrupted booking", () => {
    it("leaves the disrupted venue out of the suggestions and carries the booking in the link", async () => {
      listSuggestedVenuesMock.mockResolvedValue([venue, otherVenue]);
      renderPanel({ bookingId: "booking-1", venueId: "venue-1" });

      expect(await screen.findByRole("heading", { name: "Auditorium" })).toBeInTheDocument();
      expect(screen.queryByText("Conference Room A")).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        "/venues/venue-2?forEvent=event-1&replaces=booking-1",
      );
    });

    it("shows the empty state when the disrupted venue was the only suggestion", async () => {
      listSuggestedVenuesMock.mockResolvedValue([venue]);
      renderPanel({ bookingId: "booking-1", venueId: "venue-1" });

      expect(await screen.findByText("No matching venues")).toBeInTheDocument();
    });

    it("leaves the disrupted venue out of manual search results too, and carries the booking", async () => {
      const user = userEvent.setup();
      renderPanel({ bookingId: "booking-1", venueId: "venue-1" });

      await user.click(await screen.findByRole("button", { name: "Search venues" }));
      await user.click(screen.getByRole("button", { name: "Search venues" }));

      expect(await screen.findByRole("heading", { name: "Auditorium" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Conference Room A" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        expect.stringContaining("/venues/venue-2?forEvent=event-1&fromSearch=1"),
      );
      expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        expect.stringContaining("&replaces=booking-1"),
      );
    });

    it("does not change the links when no booking is being replaced", async () => {
      renderPanel();

      await screen.findByText("Conference Room A");
      expect(screen.getByRole("link", { name: "View details" }).getAttribute("href")).not.toContain("replaces=");
    });
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

  it("shows the venue's setup and turnaround time", async () => {
    listSuggestedVenuesMock.mockResolvedValue([
      { ...venue, setupTimeMinutes: 30, turnaroundTimeMinutes: 45 },
    ]);
    renderPanel();

    expect(await screen.findByText("Conference Room A")).toBeInTheDocument();
    expect(screen.getByText("Setup 30 min · Turnaround 45 min")).toBeInTheDocument();
  });

  it("shows zero setup and turnaround rather than hiding the line", async () => {
    renderPanel();

    expect(await screen.findByText("Conference Room A")).toBeInTheDocument();
    expect(screen.getByText("Setup 0 min · Turnaround 0 min")).toBeInTheDocument();
  });

  it("shows setup and turnaround time on a manual search result too", async () => {
    searchAvailableVenuesMock.mockResolvedValue([
      venue,
      { ...otherVenue, setupTimeMinutes: 15, turnaroundTimeMinutes: 20 },
    ]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Search venues" }));
    await user.click(screen.getByRole("button", { name: "Search venues" }));

    expect(await screen.findByRole("heading", { name: "Auditorium" })).toBeInTheDocument();
    expect(screen.getByText("Setup 15 min · Turnaround 20 min")).toBeInTheDocument();
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

// SPM-82: while choosing a replacement the coordinator sees suggestions, or why there are none.
describe("SuggestedVenuesPanel loading and results", () => {
  it("shows why the suggestions could not be loaded, with a plain message when none is given", async () => {
    listSuggestedVenuesMock.mockRejectedValueOnce(new Error("Catalogue offline"));
    const failed = renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Catalogue offline");
    failed.unmount();

    listSuggestedVenuesMock.mockRejectedValueOnce("boom");
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load suggested venues for this event.");
  });

  it("says no venue matches when none meets the requirements", async () => {
    listSuggestedVenuesMock.mockResolvedValue([]);
    renderPanel();

    expect(await screen.findByText("No matching venues")).toBeInTheDocument();
  });

  it("carries the venue's availability into its link when it is known", async () => {
    listSuggestedVenuesMock.mockResolvedValue([{ ...venue, availabilityStatus: "available" }]);
    renderPanel();

    expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute("href", "/venues/venue-1?forEvent=event-1&status=available");
  });

  it("opens a venue without a status when its availability is not known", async () => {
    listSuggestedVenuesMock.mockResolvedValue([{ ...venue, availabilityStatus: undefined }]);
    renderPanel();

    expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute("href", "/venues/venue-1?forEvent=event-1");
  });

  it("ignores suggestions that arrive after the coordinator has left the page", async () => {
    let resolveList: (items: unknown[]) => void = () => {};
    listSuggestedVenuesMock.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    const first = renderPanel();
    first.unmount();
    resolveList([venue]);

    let rejectList: (reason: unknown) => void = () => {};
    listSuggestedVenuesMock.mockReturnValueOnce(new Promise((_, reject) => { rejectList = reject; }));
    const second = renderPanel();
    second.unmount();
    rejectList(new Error("too late"));

    await waitFor(() => expect(listSuggestedVenuesMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Conference Room A")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
