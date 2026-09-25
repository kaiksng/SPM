import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const listVenuesMock = vi.fn();
const getActiveVenueBookingMock = vi.fn();
const submitVenueBookingRequestMock = vi.fn();
const withdrawVenueBookingRequestMock = vi.fn();

const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "20000000-0000-0000-0000-000000000002" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

vi.mock("@/features/event-requests/services/venue-bookings", () => ({
  listVenues: (...args: unknown[]) => listVenuesMock(...args),
  getActiveVenueBooking: (...args: unknown[]) => getActiveVenueBookingMock(...args),
  submitVenueBookingRequest: (...args: unknown[]) => submitVenueBookingRequestMock(...args),
  withdrawVenueBookingRequest: (...args: unknown[]) => withdrawVenueBookingRequestMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { VenueBookingRequestPage } from "./VenueBookingRequestPage";

const event = {
  id: "event-1",
  title: "Student Leadership Summit",
  purpose: "A summit",
  description: "Description",
  eventType: "Workshop",
  expectedAttendance: 30,
  startsAt: "2099-04-06T02:00:00.000Z",
  endsAt: "2099-04-06T04:00:00.000Z",
  status: "planning",
  submittedAt: "2026-09-12T00:00:00.000Z",
  organiserId: "10000000-0000-0000-0000-000000000001",
  organiserName: "jasmine",
  assignedCoordinatorId: "20000000-0000-0000-0000-000000000002",
  assignedCoordinatorName: "Joyce Coordinator",
  venue: {
    preferredLocation: "Main Hall",
    minimumCapacity: 20,
    accessibilityNotes: null,
    layoutNotes: null,
    facilities: [],
  },
  equipment: [],
  registration: {
    required: false,
    opensAt: null,
    closesAt: null,
    capacity: null,
    waitlistEnabled: false,
  },
};

const venues = [
  { id: "venue-1", name: "Conference Room A", capacity: 40, operatingDays: [1, 2, 3, 4, 5], operatingStartsTime: "08:00:00", operatingEndsTime: "18:00:00" },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/venue-booking"]}>
      <Routes>
        <Route path="events/:eventId/venue-booking" element={<VenueBookingRequestPage />} />
        <Route path="events/:eventId" element={<p>EVENT DETAIL PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.profile.role = "event_coordinator";
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  listVenuesMock.mockReset().mockResolvedValue(venues);
  getActiveVenueBookingMock.mockReset().mockResolvedValue(null);
  submitVenueBookingRequestMock.mockReset().mockResolvedValue("booking-1");
  withdrawVenueBookingRequestMock.mockReset().mockResolvedValue(undefined);
});

describe("VenueBookingRequestPage", () => {
  it("denies access to a non-coordinator", () => {
    authState.profile.role = "event_organiser";

    renderPage();

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(loadEventDetailMock).not.toHaveBeenCalled();
  });

  it("shows the event's expected attendance and venue requirements for context", async () => {
    renderPage();

    expect(await screen.findByText("For \"Student Leadership Summit\"")).toBeInTheDocument();
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("Main Hall")).toBeInTheDocument();
  });

  it("submits a request and then shows it as Pending", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: "Submit request" });

    await user.click(screen.getByRole("combobox", { name: "Venue" }));
    await user.click(await screen.findByRole("option", { name: /Conference Room A/ }));
    await user.type(screen.getByLabelText("Starts"), "2099-04-06T10:00");
    await user.type(screen.getByLabelText("Ends"), "2099-04-06T12:00");

    getActiveVenueBookingMock.mockResolvedValue({
      id: "booking-1",
      venueId: "venue-1",
      venueName: "Conference Room A",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T04:00:00.000Z",
      status: "pending",
      createdAt: "2026-09-25T00:00:00.000Z",
    });

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(submitVenueBookingRequestMock).toHaveBeenCalledWith(
        "event-1",
        "venue-1",
        expect.any(String),
        expect.any(String),
      );
    });
    expect(await screen.findByText("pending")).toBeInTheDocument();
    expect(screen.getByText("Conference Room A")).toBeInTheDocument();
  });

  it("shows the submission error identifying the conflict, without clearing the form", async () => {
    submitVenueBookingRequestMock.mockRejectedValue(
      new Error("This venue already has a Pending or Confirmed booking for part of the requested period"),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: "Submit request" });
    await user.click(screen.getByRole("combobox", { name: "Venue" }));
    await user.click(await screen.findByRole("option", { name: /Conference Room A/ }));
    await user.type(screen.getByLabelText("Starts"), "2099-04-06T10:00");
    await user.type(screen.getByLabelText("Ends"), "2099-04-06T12:00");
    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(
      await screen.findByText(
        "This venue already has a Pending or Confirmed booking for part of the requested period",
      ),
    ).toBeInTheDocument();
  });

  it("shows a Pending request with a Withdraw action instead of the form", async () => {
    getActiveVenueBookingMock.mockResolvedValue({
      id: "booking-1",
      venueId: "venue-1",
      venueName: "Conference Room A",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T04:00:00.000Z",
      status: "pending",
      createdAt: "2026-09-25T00:00:00.000Z",
    });

    renderPage();

    expect(await screen.findByText("pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Withdraw request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit request" })).not.toBeInTheDocument();
  });

  it("withdraws the request and reveals the submission form again", async () => {
    getActiveVenueBookingMock.mockResolvedValueOnce({
      id: "booking-1",
      venueId: "venue-1",
      venueName: "Conference Room A",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T04:00:00.000Z",
      status: "pending",
      createdAt: "2026-09-25T00:00:00.000Z",
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw request" }));

    getActiveVenueBookingMock.mockResolvedValueOnce(null);

    await waitFor(() => expect(withdrawVenueBookingRequestMock).toHaveBeenCalledWith("booking-1"));
    expect(await screen.findByRole("button", { name: "Submit request" })).toBeInTheDocument();
  });

  it("does not offer a Confirmed request a Withdraw action", async () => {
    getActiveVenueBookingMock.mockResolvedValue({
      id: "booking-1",
      venueId: "venue-1",
      venueName: "Conference Room A",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T04:00:00.000Z",
      status: "confirmed",
      createdAt: "2026-09-25T00:00:00.000Z",
    });

    renderPage();

    expect(await screen.findByText("confirmed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw request" })).not.toBeInTheDocument();
  });
});
