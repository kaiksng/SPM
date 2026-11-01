import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
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

import { venueDetailReturnState } from "@/features/venues/utils/venue-detail-navigation";
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

  // SPM-19/SPM-20: block titles must remain readable beside the red dot.
  it.each(["2099-04-06T08:00:00.000Z", "2099-04-08T08:00:00.000Z"])("uses dark month text for a block ending %s", async (endsAt) => {
    listVenueAvailabilityMock.mockResolvedValue([
      period({ type: "blocked", label: "Maintenance", endsAt, organiserName: null, coordinatorName: null, heldByName: null }),
    ]);

    const { container } = renderPage();
    const belt = await screen.findByLabelText(/Blocked .*Maintenance/);
    expect(belt.parentElement).toHaveClass("bg-red-600", "text-white");
    const title = container.querySelector(".venue-calendar__month-title--blocked")!;
    expect(title).toHaveTextContent("Maintenance");
    expect(container.querySelector(".venue-calendar__dot--blocked")).not.toBeNull();
  });

  // A block over several days is drawn as a pale-red bar across every day it
  // runs, not just a dot on its first day.
  it("draws a multi-day block as a visible bar across its days", async () => {
    listVenueAvailabilityMock.mockResolvedValue([
      period({
        type: "blocked",
        label: "Air con maintenance",
        endsAt: "2099-04-08T08:00:00.000Z",
        organiserName: null,
        coordinatorName: null,
        heldByName: null,
      }),
    ]);

    const { container } = renderPage();
    await screen.findByLabelText(/Blocked .*Air con maintenance/);
    const bars = container.querySelectorAll(".fc-h-event");
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect((bar as HTMLElement).style.backgroundColor).toBe("rgb(254, 242, 242)");
    }
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

describe("SPM-87: setup and turnaround on the availability calendar", () => {
  // The day breakdown runs 08:00-22:00 (14 hours); each segment is placed by
  // a percentage of that, e.g. "calc(10.71% + 2px)".
  function percent(value: string) {
    return Number(/calc\(([\d.]+)%/.exec(value)?.[1]);
  }

  const booking = () => period({ type: "pending", heldByName: null });

  beforeEach(() => {
    getVenueMock.mockResolvedValue({ ...venue, setupTimeMinutes: "30", turnaroundTimeMinutes: "45" });
  });

  // SPM-87 AC04 (and AC01's window): a 10:00-12:00 booking at a venue with
  // 30 min setup and 45 min turnaround shows setup 09:30-10:00 and turnaround
  // 12:00-12:45 around the event time.
  it("shows setup before and turnaround after the event time, sized to the venue's settings", async () => {
    listVenueAvailabilityMock.mockResolvedValue([booking()]);
    const { container } = renderPage();

    const setup = (await screen.findByText("Setup")).parentElement!;
    const turnaround = screen.getByText("Turnaround").parentElement!;
    // Setup: starts 1.5h after opening, lasts 0.5h.
    expect(percent(setup.style.top)).toBeCloseTo((1.5 / 14) * 100, 3);
    expect(percent(setup.style.height)).toBeCloseTo((0.5 / 14) * 100, 3);
    // Turnaround: starts at 12:00 (4h after opening), lasts 0.75h.
    expect(percent(turnaround.style.top)).toBeCloseTo((4 / 14) * 100, 3);
    expect(percent(turnaround.style.height)).toBeCloseTo((0.75 / 14) * 100, 3);
    // The event time itself still reads 10 AM - 12 PM.
    expect(screen.getByText("Booked by Olivia Organiser").closest("[title]")).toHaveTextContent(
      "10 AM – 12 PM",
    );
    expect(container.querySelectorAll(".venue-calendar__buffer-bar")).toHaveLength(2);
  });

  // SPM-87 AC04: setup and turnaround are drawn distinctly from the event time,
  // and the legend names them.
  it("draws setup and turnaround in their own style, not the booking's", async () => {
    listVenueAvailabilityMock.mockResolvedValue([booking()]);
    renderPage();

    const setup = (await screen.findByText("Setup")).parentElement!;
    const event = screen.getByText("Booked by Olivia Organiser").closest("[title]")!.parentElement!;
    expect(setup).toHaveClass("venue-calendar__buffer-bar");
    expect(setup).not.toHaveClass("bg-amber-50");
    expect(event).toHaveClass("bg-amber-50");
    expect(event).not.toHaveClass("venue-calendar__buffer-bar");
    expect(screen.getByText("Setup / turnaround")).toBeInTheDocument();
  });

  // SPM-87 AC01: setup and turnaround belong to bookings; a block has none.
  it("adds no setup or turnaround to an operational block", async () => {
    listVenueAvailabilityMock.mockResolvedValue([
      period({ type: "blocked", label: "Maintenance", organiserName: null, coordinatorName: null, heldByName: null }),
    ]);
    renderPage();

    expect(await screen.findByLabelText("Blocked 10 AM – 12 PM. Maintenance")).toBeInTheDocument();
    expect(screen.queryByText("Setup")).not.toBeInTheDocument();
    expect(screen.queryByText("Turnaround")).not.toBeInTheDocument();
  });

  // SPM-87 AC01: a venue with no setup or turnaround adds nothing around the event.
  it("shows no setup or turnaround when the venue has none", async () => {
    getVenueMock.mockResolvedValue({ ...venue, setupTimeMinutes: "0", turnaroundTimeMinutes: "0" });
    listVenueAvailabilityMock.mockResolvedValue([booking()]);
    renderPage();

    expect(await screen.findByText("Booked by Olivia Organiser")).toBeInTheDocument();
    expect(screen.queryByText("Setup")).not.toBeInTheDocument();
    expect(screen.queryByText("Turnaround")).not.toBeInTheDocument();
  });

  // SPM-87 AC01: the window uses the venue's current settings.
  it("uses the venue's current setup and turnaround values", async () => {
    getVenueMock.mockResolvedValue({ ...venue, setupTimeMinutes: "60", turnaroundTimeMinutes: "15" });
    listVenueAvailabilityMock.mockResolvedValue([booking()]);
    renderPage();

    const setup = (await screen.findByText("Setup")).parentElement!;
    const turnaround = screen.getByText("Turnaround").parentElement!;
    // Setup 09:00-10:00, turnaround 12:00-12:15.
    expect(percent(setup.style.top)).toBeCloseTo((1 / 14) * 100, 3);
    expect(percent(setup.style.height)).toBeCloseTo((1 / 14) * 100, 3);
    expect(percent(turnaround.style.height)).toBeCloseTo((0.25 / 14) * 100, 3);
  });
});

// Bug: a coordinator opened View availability from a venue page reached via
// "view suggested venue" (/venues/:id?forEvent=...). "Back to <venue>" then
// linked to a bare /venues/:id, dropping the event context, so the Request
// this venue panel disappeared and the venue page's own back button led to
// the calendar. Coming from the venue page, Back must return to that exact URL.
describe("Back to the venue", () => {
  function VenueProbe() {
    const location = useLocation();
    return <p>VENUE PAGE {location.pathname + location.search}</p>;
  }

  it("returns to the venue page it came from, keeping the event context", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/venues/venue-1?forEvent=event-1",
          {
            pathname: "/venues/venue-1/availability",
            state: venueDetailReturnState("/venues/venue-1", "?forEvent=event-1"),
          },
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route path="venues/:venueId" element={<VenueProbe />} />
          <Route path="venues/:venueId/availability" element={<VenueAvailabilityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "Back to Seminar Room" }));

    expect(await screen.findByText("VENUE PAGE /venues/venue-1?forEvent=event-1")).toBeInTheDocument();
  });

  // Venue Staff: whatever is in browser history (e.g. the catalogue), Back
  // goes to the venue page, not one step back.
  it("goes to the venue page even when the previous history entry is the catalogue", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[
          "/venues",
          { pathname: "/venues/venue-1/availability", state: venueDetailReturnState("/venues/venue-1", "") },
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route path="venues" element={<p>CATALOGUE</p>} />
          <Route path="venues/:venueId" element={<VenueProbe />} />
          <Route path="venues/:venueId/availability" element={<VenueAvailabilityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "Back to Seminar Room" }));

    expect(await screen.findByText("VENUE PAGE /venues/venue-1")).toBeInTheDocument();
    expect(screen.queryByText("CATALOGUE")).not.toBeInTheDocument();
  });

  it("ignores a return address for a different venue", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: "/venues/venue-1/availability", state: venueDetailReturnState("/venues/venue-2", "") },
        ]}
      >
        <Routes>
          <Route path="venues/:venueId/availability" element={<VenueAvailabilityPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: "Back to Seminar Room" })).toHaveAttribute("href", "/venues/venue-1");
  });

  it("links to the venue page when opened directly", async () => {
    renderPage();

    expect(await screen.findByRole("link", { name: "Back to Seminar Room" })).toHaveAttribute(
      "href",
      "/venues/venue-1",
    );
  });
});
