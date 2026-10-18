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
    // Tuesday 6 Apr 2099, 10:00-12:00 SGT.
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
