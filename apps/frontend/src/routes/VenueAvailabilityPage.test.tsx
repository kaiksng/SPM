import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { VenueAvailabilityPeriod } from "@/features/venues/services/venue-availability";

const getVenueMock = vi.fn();
const listVenueAvailabilityMock = vi.fn();
const authState = {
  profile: { full_name: "Sam Staff", role: "venue_staff" },
  user: { id: "staff-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/venues/services/venues", () => ({
  getVenue: (...args: unknown[]) => getVenueMock(...args),
}));

vi.mock("@/features/venues/services/venue-availability", () => ({
  listVenueAvailability: (...args: unknown[]) => listVenueAvailabilityMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { VenueAvailabilityPage } from "./VenueAvailabilityPage";

const venue = {
  name: "Seminar Room",
  location: "Block A",
  capacity: "80",
  operatingHours: [{ days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], opensAt: "08:00", closesAt: "22:00" }],
  description: "",
  accessibilityNotes: "",
  facilities: [],
  layouts: ["Theatre"],
  updatedAt: "2099-04-01T00:00:00.000Z",
  updatedByName: null,
  setupTimeMinutes: "0",
  turnaroundTimeMinutes: "0",
};

function period(overrides: Partial<VenueAvailabilityPeriod>): VenueAvailabilityPeriod {
  return {
    id: "booking-1",
    type: "on_hold",
    // Monday 6 Apr 2099, 10:00-12:00 SGT.
    startsAt: "2099-04-06T02:00:00.000Z",
    endsAt: "2099-04-06T04:00:00.000Z",
    label: "Evening Talk",
    organiserName: "Olivia Organiser",
    coordinatorName: "Joyce Coordinator",
    heldByName: "Sam Staff",
    isMine: false,
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/venues/venue-1/availability"]}>
      <Routes>
        <Route path="venues/:venueId/availability" element={<VenueAvailabilityPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Only the clock: the calendar opens on this month and the day strip on this day.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2099-04-06T00:00:00.000Z"));
  getVenueMock.mockReset().mockResolvedValue(venue);
  listVenueAvailabilityMock.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("VenueAvailabilityPage: a venue booking on hold", () => {
  it("AC04: shows an active hold on the calendar in the On Hold style, which the legend names", async () => {
    listVenueAvailabilityMock.mockResolvedValue([period({})]);
    const { container } = renderPage();

    expect(await screen.findByText("On Hold")).toBeInTheDocument();
    const monthTitle = container.querySelector(".venue-calendar__month-title--on_hold");
    expect(monthTitle).toHaveTextContent("Evening Talk");
    expect(container.querySelector(".venue-calendar__dot--on_hold")).not.toBeNull();
    expect(listVenueAvailabilityMock).toHaveBeenCalledWith("venue-1", "staff-1");
  });

  it("AC04: the day's timeline shows the held period and who placed the hold", async () => {
    listVenueAvailabilityMock.mockResolvedValue([period({})]);
    renderPage();

    const heldBy = await screen.findByText("Held by Sam Staff");
    const block = heldBy.closest("[title]")!;
    expect(block).toHaveTextContent("10 AM – 12 PM");
    expect(block).toHaveTextContent("Evening Talk");
    expect(block.parentElement).toHaveClass("bg-indigo-50");
  });

  it("does not present a Pending request as a hold", async () => {
    listVenueAvailabilityMock.mockResolvedValue([period({ type: "pending", heldByName: null })]);
    const { container } = renderPage();

    expect(await screen.findByText("Booked by Olivia Organiser")).toBeInTheDocument();
    expect(screen.queryByText(/^Held by/)).not.toBeInTheDocument();
    expect(container.querySelector(".venue-calendar__month-title--on_hold")).toBeNull();
    expect(container.querySelector(".venue-calendar__month-title--pending")).toHaveTextContent("Evening Talk");
  });
});

describe("SPM-20: viewing venue availability", () => {
  // SPM-20 AC01: an authorised user sees the selected venue's calendar and
  // the selected day's hours, read from the venue's operating hours.
  it("shows the selected venue's availability for the selected day and its time range", async () => {
    renderPage();

    expect(await screen.findByRole("heading", { name: "Seminar Room" })).toBeInTheDocument();
    expect(getVenueMock).toHaveBeenCalledWith("venue-1");
    expect(listVenueAvailabilityMock).toHaveBeenCalledWith("venue-1", "staff-1");
    expect(screen.getByRole("heading", { name: /Monday,? 6 April/ })).toBeInTheDocument();
    expect(screen.getByText("8 AM – 10 PM")).toBeInTheDocument();
  });

  // SPM-20 AC02: the legend names each status the calendar can show.
  it("names every availability status in the legend", async () => {
    renderPage();

    await screen.findByRole("heading", { name: "Seminar Room" });
    for (const label of [
      "Available",
      "Pending Booking",
      "On Hold",
      "Your confirmed booking",
      "Booked (unavailable to you)",
      "Blocked",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  // SPM-20 AC02: booked and blocked periods are drawn in distinct styles.
  it("draws a booking and a block in different styles on the calendar and the day breakdown", async () => {
    listVenueAvailabilityMock.mockResolvedValue([
      period({ id: "booked", type: "confirmed", heldByName: null, label: "Evening Talk" }),
      period({
        id: "blocked",
        type: "blocked",
        label: "Aircon repair",
        organiserName: null,
        coordinatorName: null,
        heldByName: null,
        startsAt: "2099-04-06T06:00:00.000Z",
        endsAt: "2099-04-06T08:00:00.000Z",
      }),
    ]);
    const { container } = renderPage();

    const blocked = await screen.findByLabelText("Blocked 2 PM – 4 PM. Aircon repair");
    expect(blocked.parentElement).toHaveClass("bg-red-600");
    // Someone else's confirmed booking is drawn as Booked (unavailable to you).
    expect(container.querySelector("div.bg-pink-100")).toHaveTextContent("10 AM – 12 PM");
    expect(container.querySelector(".venue-calendar__month-title--reserved")).not.toBeNull();
    expect(container.querySelector(".venue-calendar__month-title--blocked")).toHaveTextContent(
      "Aircon repair",
    );
  });

  // SPM-20 AC02: the viewer's own confirmed booking is told apart from someone else's.
  it("shows the viewer's own confirmed booking differently from another's", async () => {
    listVenueAvailabilityMock.mockResolvedValue([
      period({ type: "confirmed", heldByName: null, isMine: true }),
    ]);
    const { container } = renderPage();

    const booked = (await screen.findByText("Booked by Olivia Organiser")).closest("[title]")!;
    expect(booked.parentElement).toHaveClass("bg-emerald-50");
    expect(container.querySelector(".venue-calendar__month-title--confirmed")).not.toBeNull();
    expect(container.querySelector(".venue-calendar__month-title--reserved")).toBeNull();
  });

  // SPM-20 AC03: a block shows its start and end time and is named as a block.
  it("shows a block's start and end time, its reason, and that it is a block", async () => {
    listVenueAvailabilityMock.mockResolvedValue([
      period({
        type: "blocked",
        label: "Annual maintenance",
        organiserName: null,
        coordinatorName: null,
        heldByName: null,
      }),
    ]);
    renderPage();

    const blocked = await screen.findByLabelText("Blocked 10 AM – 12 PM. Annual maintenance");
    expect(blocked).toHaveTextContent("10 AM – 12 PM");
    expect(blocked).toHaveTextContent("Annual maintenance");
    expect(screen.queryByText(/^Booked by/)).not.toBeInTheDocument();
  });

  // SPM-20 AC03: a booking shows its start and end time and who it is booked by.
  it("shows a booking's start and end time, its event and who booked it", async () => {
    listVenueAvailabilityMock.mockResolvedValue([
      period({ type: "pending", heldByName: null }),
    ]);
    renderPage();

    const booking = (await screen.findByText("Booked by Olivia Organiser")).closest("[title]")!;
    expect(booking).toHaveTextContent("10 AM – 12 PM");
    expect(booking).toHaveTextContent("Evening Talk");
    expect(booking).toHaveTextContent("Coordinator: Joyce Coordinator");
    expect(screen.queryByLabelText(/^Blocked/)).not.toBeInTheDocument();
  });

  // SPM-20 AC04: with no bookings or blocks, the venue is fully Available.
  it("shows a venue with no bookings or blocks as available all day", async () => {
    const { container } = renderPage();

    expect(await screen.findByText("Available all day")).toBeInTheDocument();
    expect(container.querySelector(".venue-calendar__month-event")).toBeNull();
    expect(screen.queryByLabelText(/^Blocked/)).not.toBeInTheDocument();
  });

  it("shows a day outside the venue's operating hours as closed, not available", async () => {
    getVenueMock.mockResolvedValue({
      ...venue,
      operatingHours: [{ days: ["tue", "wed", "thu", "fri"], opensAt: "08:00", closesAt: "22:00" }],
    });
    renderPage();

    expect(await screen.findByText("Closed all day")).toBeInTheDocument();
    expect(screen.queryByText("Available all day")).not.toBeInTheDocument();
  });

  it("explains when the availability cannot be loaded", async () => {
    listVenueAvailabilityMock.mockRejectedValue(
      new Error("We couldn't load this venue's availability."),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't load this venue's availability.",
    );
  });

  // SPM-20: availability is for authorised internal users; an attendee is denied.
  it("denies a role that is not an authorised internal user", async () => {
    authState.profile.role = "attendee";
    try {
      renderPage();

      expect(await screen.findByText("Access denied")).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Seminar Room" })).not.toBeInTheDocument();
    } finally {
      authState.profile.role = "venue_staff";
    }
  });
});
