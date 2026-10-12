import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getVenueMock = vi.fn();
const listVenueBufferTimeChangesMock = vi.fn();
const loadEventDetailMock = vi.fn();
const submitVenueBookingRequestMock = vi.fn();
const getActiveVenueBookingMock = vi.fn();
const checkVenueBookingAvailabilityMock = vi.fn();
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
  listVenueBufferTimeChanges: (...args: unknown[]) => listVenueBufferTimeChangesMock(...args),
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
  checkVenueBookingAvailability: (...args: unknown[]) => checkVenueBookingAvailabilityMock(...args),
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
  setupTimeMinutes: "15",
  turnaroundTimeMinutes: "30",
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
  listVenueBufferTimeChangesMock.mockReset().mockResolvedValue([]);
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  submitVenueBookingRequestMock.mockReset().mockResolvedValue("booking-1");
  getActiveVenueBookingMock.mockReset().mockResolvedValue(null);
  checkVenueBookingAvailabilityMock.mockReset().mockResolvedValue({ available: true, reason: null });
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

  // SPM-86 AC03: saved setup and turnaround times are shown on the details page.
  it("shows the venue's setup and turnaround time", async () => {
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Setup time")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("Turnaround time")).toBeInTheDocument();
    expect(screen.getByText("30 min")).toBeInTheDocument();
  });

  // SPM-86 AC04/AC05: Venue Staff see who changed a value, from what, to what, and when.
  it("shows the setup and turnaround change history to Venue Staff", async () => {
    authState.profile.role = "venue_staff";
    listVenueBufferTimeChangesMock.mockResolvedValue([
      {
        id: 2,
        field: "turnaround_time_minutes",
        previousValue: 0,
        newValue: 30,
        changedByName: "Sam Staff",
        changedAt: "2026-10-01T02:00:00.000Z",
      },
      {
        id: 1,
        field: "setup_time_minutes",
        previousValue: 5,
        newValue: 15,
        changedByName: null,
        changedAt: "2026-09-30T02:00:00.000Z",
      },
    ]);
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Change history")).toBeInTheDocument();
    expect(await screen.findByText(/Turnaround time changed/)).toBeInTheDocument();
    expect(screen.getByText(/Setup time changed/)).toBeInTheDocument();
    expect(screen.getByText("0 min →")).toBeInTheDocument();
    expect(screen.getByText("5 min →")).toBeInTheDocument();
    expect(screen.getByText(/Sam Staff/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown/)).toBeInTheDocument();
    expect(listVenueBufferTimeChangesMock).toHaveBeenCalledWith("venue-1");
  });

  it("tells Venue Staff when no setup or turnaround change has been recorded", async () => {
    authState.profile.role = "venue_staff";
    renderPage("/venues/venue-1");

    expect(
      await screen.findByText("No setup or turnaround time changes recorded yet."),
    ).toBeInTheDocument();
  });

  // SPM-86 AC05: the history is Venue Staff only, so other roles never request it.
  it("does not show or request the change history for a coordinator", async () => {
    renderPage("/venues/venue-1");

    await screen.findByText("Setup time");
    expect(screen.queryByText("Change history")).not.toBeInTheDocument();
    expect(listVenueBufferTimeChangesMock).not.toHaveBeenCalled();
  });

  it("shows the selected location and a separate saved address", async () => {
    getVenueMock.mockResolvedValue({ ...venue, areaTags: ["Bugis"], location: "1 Beach Road" });
    renderPage("/venues/venue-1");

    expect(await screen.findByText("Bugis")).toBeInTheDocument();
    expect(screen.getByText("1 Beach Road")).toBeInTheDocument();
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
    checkVenueBookingAvailabilityMock.mockResolvedValue({
      available: false,
      reason: "This venue is not available for the event's saved schedule.",
    });
    renderPage("/venues/venue-1?forEvent=event-1&status=confirmed");

    expect(await screen.findByText("Request this venue")).toBeInTheDocument();
    expect(
      await screen.findByText("This venue is not available for the event's saved schedule."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("does not trust a direct link when fresh availability fails", async () => {
    checkVenueBookingAvailabilityMock.mockResolvedValue({
      available: false,
      reason: "This venue is not available for the event's saved schedule.",
    });
    renderPage("/venues/venue-1?forEvent=event-1");
    expect(
      await screen.findByText("This venue is not available for the event's saved schedule."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("keeps an exploratory result review-only", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&fromSearch=1&explore=1");
    expect(await screen.findByText(/discuss a schedule change with the organiser/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeDisabled();
  });

  it("explains the next step when a venue is outside the organiser's preferred location", async () => {
    getVenueMock.mockResolvedValue({ ...venue, location: "West Wing" });
    renderPage("/venues/venue-1?forEvent=event-1&fromSearch=1");

    expect(await screen.findByText(/The organiser requested Campus, but this venue is in West Wing/)).toBeInTheDocument();
    expect(screen.getByText(/Check the alternative with the organiser before requesting it/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "update the event’s venue requirements" })).toHaveAttribute(
      "href", "/events/event-1/coordinator-edit",
    );
    expect(await screen.findByRole("button", { name: "Request venue" })).toBeInTheDocument();
  });

  it("still allows requesting a venue tagged as available", async () => {
    renderPage("/venues/venue-1?forEvent=event-1&status=available");

    expect(await screen.findByRole("button", { name: "Request venue" })).toBeInTheDocument();
  });
});
