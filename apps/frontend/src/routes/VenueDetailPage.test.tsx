import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVenueMock = vi.fn();
const loadEventDetailMock = vi.fn();
const submitVenueBookingRequestMock = vi.fn();
const getActiveVenueBookingMock = vi.fn();
const searchAvailableVenuesMock = vi.fn();
const navigateMock = vi.fn();
const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "coord-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/venues/services/venues", () => ({
  getVenue: (...args: unknown[]) => getVenueMock(...args),
  VENUE_AVAILABILITY_LABELS: {
    available: "Available",
    pending: "Pending",
    confirmed: "Confirmed",
    blocked: "Blocked",
  },
}));

vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

vi.mock("@/features/venues/services/venue-bookings", () => ({
  submitVenueBookingRequest: (...args: unknown[]) => submitVenueBookingRequestMock(...args),
  getActiveVenueBooking: (...args: unknown[]) => getActiveVenueBookingMock(...args),
}));
vi.mock("@/features/venues/services/venue-search", () => ({
  searchAvailableVenues: (...args: unknown[]) => searchAvailableVenuesMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { VenueDetailPage } from "./VenueDetailPage";

const venue = {
  name: "Auditorium",
  location: "Campus",
  capacity: "250",
  operatingHours: [{ days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], opensAt: "00:00", closesAt: "23:59" }],
  description: "",
  accessibilityNotes: "",
  facilities: ["projector", "stage"],
  layouts: ["Open Floor"],
  updatedAt: "2026-09-26T06:11:00.000Z",
  updatedByName: "keith",
};

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

function renderPage(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="venues/:venueId" element={<VenueDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getVenueMock.mockReset().mockResolvedValue(venue);
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  submitVenueBookingRequestMock.mockReset().mockResolvedValue("booking-1");
  getActiveVenueBookingMock.mockReset().mockResolvedValue(null);
  searchAvailableVenuesMock.mockReset().mockResolvedValue([{ id: "venue-1" }]);
  navigateMock.mockReset();
  authState.profile.role = "event_coordinator";
});

describe("VenueDetailPage", () => {
  it("shows the venue's full details", async () => {
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Campus")).toBeInTheDocument();
    expect(screen.getByText("250")).toBeInTheDocument();
    expect(screen.getByText("projector")).toBeInTheDocument();
    expect(screen.getByText("stage")).toBeInTheDocument();
    expect(screen.getByText("Open Floor")).toBeInTheDocument();
  });

  it("does not offer to request a venue without a forEvent param", async () => {
    renderPage("/venues/venue-1");

    await screen.findByText("Auditorium");
    expect(screen.queryByText("Request this venue")).not.toBeInTheDocument();
  });

  it("offers a Request this venue action for a coordinator with a forEvent param", async () => {
    renderPage("/venues/venue-1?forEvent=event-1");

    expect(await screen.findByText("Request this venue")).toBeInTheDocument();
    expect(await screen.findByText(/Career Fair/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request venue" })).toBeInTheDocument();
  });

  it("does not offer to request a venue for a non-coordinator", async () => {
    authState.profile.role = "event_organiser";
    renderPage("/venues/venue-1?forEvent=event-1");

    await screen.findByText("Auditorium");
    expect(screen.queryByText("Request this venue")).not.toBeInTheDocument();
  });

  it("submits the booking request and navigates back to the event's venue page", async () => {
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1");

    await user.click(await screen.findByRole("button", { name: "Request venue" }));

    await waitFor(() => {
      expect(submitVenueBookingRequestMock).toHaveBeenCalledWith("event-1", "venue-1");
    });
    expect(navigateMock).toHaveBeenCalledWith("/events/event-1/venue");
  });

  it("shows the specific error identifying why the request failed", async () => {
    submitVenueBookingRequestMock.mockRejectedValue(
      new Error("This event already has an active venue booking request"),
    );
    const user = userEvent.setup();
    renderPage("/venues/venue-1?forEvent=event-1");

    await user.click(await screen.findByRole("button", { name: "Request venue" }));

    expect(
      await screen.findByText("This event already has an active venue booking request"),
    ).toBeInTheDocument();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("disables the request action for a venue tagged as reference-only", async () => {
    searchAvailableVenuesMock.mockResolvedValue([]);
    renderPage("/venues/venue-1?forEvent=event-1&status=confirmed");

    expect(await screen.findByText("Request this venue")).toBeInTheDocument();
    expect(await screen.findByText(/not available or suitable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request venue" })).not.toBeInTheDocument();
  });

  it("does not trust a direct link when fresh availability fails", async () => {
    searchAvailableVenuesMock.mockResolvedValue([]);
    renderPage("/venues/venue-1?forEvent=event-1");
    expect(await screen.findByText(/not available or suitable/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request venue" })).not.toBeInTheDocument();
  });

  it("keeps an exploratory result review-only", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&fromSearch=1&explore=1");
    expect(await screen.findByText(/update the event before booking/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request venue" })).not.toBeInTheDocument();
  });

  it("still allows requesting a venue tagged as available", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&status=available");

    expect(await screen.findByRole("button", { name: "Request venue" })).toBeInTheDocument();
  });
});
