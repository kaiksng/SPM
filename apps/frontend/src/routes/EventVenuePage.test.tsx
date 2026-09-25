import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const getActiveVenueBookingMock = vi.fn();
const withdrawVenueBookingRequestMock = vi.fn();
const listSuggestedVenuesMock = vi.fn();
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

vi.mock("@/features/venues/services/venues", () => ({
  listSuggestedVenues: (...args: unknown[]) => listSuggestedVenuesMock(...args),
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
});

describe("EventVenuePage", () => {
  it("shows the suggestions panel when the event has no active booking", async () => {
    renderPage();

    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
    expect(screen.queryByText("Current request")).not.toBeInTheDocument();
  });

  it("shows the active request instead of suggestions when one exists", async () => {
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
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Conference Room A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw request" })).toBeInTheDocument();
    expect(screen.queryByText("Suggested venues")).not.toBeInTheDocument();
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

    expect(await screen.findByText("approved")).toBeInTheDocument();
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
});
