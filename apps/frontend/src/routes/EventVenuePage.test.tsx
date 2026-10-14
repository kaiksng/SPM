import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const getActiveVenueBookingMock = vi.fn();
const withdrawVenueBookingRequestMock = vi.fn();
const listSuggestedVenuesMock = vi.fn();
const listVenueDisruptionsMock = vi.fn();
const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "coord-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

vi.mock("@/features/venues/services/venue-bookings", () => ({
  getActiveVenueBooking: (...args: unknown[]) => getActiveVenueBookingMock(...args),
  withdrawVenueBookingRequest: (...args: unknown[]) => withdrawVenueBookingRequestMock(...args),
}));

vi.mock("@/features/venues/services/venue-disruptions", () => ({
  listVenueDisruptionsForCoordinator: (...args: unknown[]) => listVenueDisruptionsMock(...args),
}));

vi.mock("@/features/venues/services/venues", () => ({
  listSuggestedVenues: (...args: unknown[]) => listSuggestedVenuesMock(...args),
  VENUE_AVAILABILITY_LABELS: {
    available: "Available",
    pending: "Pending",
    confirmed: "Confirmed",
    blocked: "Blocked",
  },
}));

// Imported by ManualVenueSearch inside SuggestedVenuesPanel. Unmocked, it
// loads the real Supabase client, which throws without VITE_SUPABASE_URL.
vi.mock("@/features/venues/services/venue-search", () => ({
  searchAvailableVenues: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { EventVenuePage } from "./EventVenuePage";

const event = {
  id: "event-1",
  title: "Career Fair",
  purpose: "Recruit interns",
  description: "Desc",
  eventType: "Fair",
  expectedAttendance: 200,
  startsAt: "2099-04-06T02:00:00.000Z",
  endsAt: "2099-04-06T04:00:00.000Z",
  status: "planning",
  submittedAt: "2026-09-20T00:00:00.000Z",
  organiserId: "org-1",
  organiserName: "kenneth",
  assignedCoordinatorId: "coord-1",
  assignedCoordinatorName: "joyce",
  venue: {
    preferredLocation: "Campus",
    minimumCapacity: null,
    accessibilityNotes: null,
    layoutNotes: "",
    facilities: [],
  },
  equipment: [],
  registration: { required: false, opensAt: null, closesAt: null, capacity: null, waitlistEnabled: false },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/venue"]}>
      <Routes>
        <Route path="events/:eventId/venue" element={<EventVenuePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  getActiveVenueBookingMock.mockReset().mockResolvedValue(null);
  withdrawVenueBookingRequestMock.mockReset().mockResolvedValue(undefined);
  listSuggestedVenuesMock.mockReset().mockResolvedValue([]);
  listVenueDisruptionsMock.mockReset().mockResolvedValue([]);
});

describe("EventVenuePage", () => {
  it("shows the suggestions panel when the event has no active booking", async () => {
    renderPage();

    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
    expect(screen.queryByText("Current request")).not.toBeInTheDocument();
  });

  it("shows the active request and keeps venue browsing available", async () => {
    getActiveVenueBookingMock.mockResolvedValue({
      id: "booking-1",
      venueId: "venue-1",
      venueName: "Conference Room A",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T04:00:00.000Z",
      status: "pending",
    });

    renderPage();

    expect(await screen.findByText("Current request")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("Conference Room A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw request" })).toBeInTheDocument();
    expect(screen.getByText("Suggested venues")).toBeInTheDocument();
  });

  it("does not offer a Withdraw action for an Approved request", async () => {
    getActiveVenueBookingMock.mockResolvedValue({
      id: "booking-1",
      venueId: "venue-1",
      venueName: "Conference Room A",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T04:00:00.000Z",
      status: "approved",
    });

    renderPage();

    expect(await screen.findByText("Confirmed Booking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw request" })).not.toBeInTheDocument();
  });

  it("withdraws the request and shows suggestions again", async () => {
    getActiveVenueBookingMock.mockResolvedValueOnce({
      id: "booking-1",
      venueId: "venue-1",
      venueName: "Conference Room A",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T04:00:00.000Z",
      status: "pending",
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw request" }));

    await waitFor(() => expect(withdrawVenueBookingRequestMock).toHaveBeenCalledWith("booking-1"));
    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
  });

  // ---- SPM-82: replacing a disrupted booking ----

  const disruption = {
    id: "disruption-1",
    bookingId: "booking-1",
    eventId: "event-1",
    eventTitle: "Career Fair",
    venueId: "venue-1",
    venueName: "Auditorium",
    bookingStartsAt: "2099-04-06T02:00:00.000Z",
    bookingEndsAt: "2099-04-06T04:00:00.000Z",
    blockReasonCategory: "maintenance" as const,
    blockReason: "Air-conditioning repair",
    blockStartsAt: "2099-04-06T04:00:00.000Z",
    blockEndsAt: "2099-04-06T06:00:00.000Z",
    flaggedAt: "2099-04-01T00:00:00.000Z",
    clearedAt: null,
    replacementBookingId: null,
    state: "replacement_required" as const,
  };
  const approvedOriginal = {
    id: "booking-1",
    venueId: "venue-1",
    venueName: "Auditorium",
    startsAt: "2099-04-06T02:00:00.000Z",
    endsAt: "2099-04-06T04:00:00.000Z",
    status: "approved",
    expiresAt: null,
    replacesBookingId: null,
  };
  const pendingReplacement = {
    id: "booking-2",
    venueId: "venue-2",
    venueName: "Grand Hall",
    startsAt: "2099-04-06T02:00:00.000Z",
    endsAt: "2099-04-06T04:00:00.000Z",
    status: "pending",
    expiresAt: null,
    replacesBookingId: "booking-1",
  };

  function suggestedVenue(id: string, name: string) {
    return {
      id, name, location: "Campus", areaTags: [], capacity: 300, operatingHours: [],
      description: null, accessibilityNotes: null, facilities: [], layouts: [],
      updatedAt: "2026-09-26T06:11:00.000Z", updatedByName: null, needsReviewCount: 0,
      availabilityStatus: "available" as const,
    };
  }

  // SPM-82 AC01/AC02: from the disrupted booking the coordinator searches for a
  // venue; the disrupted venue itself is never offered, and each result carries
  // the booking so requesting it replaces that booking.
  it("shows the disrupted booking and offers other venues as its replacement", async () => {
    getActiveVenueBookingMock.mockResolvedValue(approvedOriginal);
    listVenueDisruptionsMock.mockResolvedValue([disruption]);
    listSuggestedVenuesMock.mockResolvedValue([
      suggestedVenue("venue-1", "Auditorium"),
      suggestedVenue("venue-2", "Grand Hall"),
    ]);

    renderPage();

    const card = await screen.findByRole("region", { name: "Disrupted venue booking" });
    expect(within(card).getByText("Auditorium")).toBeInTheDocument();
    expect(within(card).getByText("Replacement Required")).toBeInTheDocument();
    expect(within(card).getByText("Maintenance – Air-conditioning repair")).toBeInTheDocument();
    expect(within(card).getByText(/event has not been cancelled/)).toBeInTheDocument();
    // The disrupted original is shown by that card, not as a "current request".
    expect(screen.queryByText("Current request")).not.toBeInTheDocument();

    expect(await screen.findByText("Grand Hall")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Auditorium" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/venues/venue-2?forEvent=event-1&status=available&replaces=booking-1",
    );
  });

  // SPM-82 AC08: while a replacement is pending, the coordinator can withdraw it
  // and the original stays disrupted, so a new replacement can be chosen.
  it("shows a pending replacement next to the disrupted booking and lets it be withdrawn", async () => {
    getActiveVenueBookingMock.mockResolvedValueOnce(pendingReplacement).mockResolvedValue(approvedOriginal);
    listVenueDisruptionsMock
      .mockResolvedValueOnce([{ ...disruption, replacementBookingId: "booking-2", state: "replacement_requested" }])
      .mockResolvedValue([disruption]);
    const user = userEvent.setup();

    renderPage();

    expect(await screen.findByText("Replacement request")).toBeInTheDocument();
    expect(screen.getByText("Grand Hall")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Disrupted venue booking" });
    expect(within(card).getByText("Replacement Requested")).toBeInTheDocument();
    expect(within(card).getByText(/stays until Venue Staff approve it/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Withdraw request" }));

    await waitFor(() => expect(withdrawVenueBookingRequestMock).toHaveBeenCalledWith("booking-2"));
    // The original is still disrupted, so the replacement choice is offered again.
    const refreshed = await screen.findByRole("region", { name: "Disrupted venue booking" });
    expect(within(refreshed).getByText("Replacement Required")).toBeInTheDocument();
    expect(screen.queryByText("Replacement request")).not.toBeInTheDocument();
  });

  it("does not show a disruption that is already resolved", async () => {
    getActiveVenueBookingMock.mockResolvedValue(pendingReplacement);
    listVenueDisruptionsMock.mockResolvedValue([{ ...disruption, state: "resolved", clearedAt: "2099-04-02T00:00:00.000Z" }]);

    renderPage();

    expect(await screen.findByText("Replacement request")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Disrupted venue booking" })).not.toBeInTheDocument();
  });

  it("still works when the disruptions cannot be loaded", async () => {
    listVenueDisruptionsMock.mockRejectedValue(new Error("boom"));

    renderPage();

    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Disrupted venue booking" })).not.toBeInTheDocument();
  });
});
