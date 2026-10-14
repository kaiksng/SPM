import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The component only imports types from the service; mock the client so
// nothing can reach a real Supabase project.
vi.mock("@/lib/supabase-client", () => ({ supabase: {} }));

import type { VenueDisruption } from "@/features/venues/services/venue-disruptions";

import {
  AffectedVenueBookings,
  RESOLVED_VISIBLE_DAYS,
  splitVenueDisruptions,
} from "./affected-venue-bookings";

const NOW = new Date("2099-04-20T00:00:00.000Z");

function disruption(overrides: Partial<VenueDisruption> = {}): VenueDisruption {
  return {
    id: "d-1",
    bookingId: "b-1",
    eventId: "e-1",
    eventTitle: "Career Fair",
    venueId: "v-1",
    venueName: "Auditorium",
    bookingStartsAt: "2099-04-25T02:00:00.000Z",
    bookingEndsAt: "2099-04-25T04:00:00.000Z",
    blockReasonCategory: "maintenance",
    blockReason: "Air-conditioning repair",
    blockStartsAt: "2099-04-25T04:00:00.000Z",
    blockEndsAt: "2099-04-25T06:00:00.000Z",
    flaggedAt: "2099-04-01T00:00:00.000Z",
    clearedAt: null,
    replacementBookingId: null,
    state: "replacement_required",
    ...overrides,
  };
}

const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();

function renderPanel(items: VenueDisruption[], error?: string) {
  return render(
    <MemoryRouter>
      <AffectedVenueBookings disruptions={items} error={error} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("splitVenueDisruptions", () => {
  it("keeps open items and resolved ones from the last 14 days", () => {
    const open = disruption({ id: "open" });
    const requested = disruption({ id: "requested", state: "replacement_requested" });
    const recent = disruption({ id: "recent", state: "resolved", clearedAt: daysAgo(RESOLVED_VISIBLE_DAYS - 1) });
    const old = disruption({ id: "old", state: "resolved", clearedAt: daysAgo(RESOLVED_VISIBLE_DAYS + 1) });

    const { open: openItems, recentlyResolved } = splitVenueDisruptions([open, requested, recent, old], NOW.getTime());

    expect(openItems.map((item) => item.id)).toEqual(["open", "requested"]);
    expect(recentlyResolved.map((item) => item.id)).toEqual(["recent"]);
  });

  it("dates a resolved item that was never cleared by when it was flagged", () => {
    const stale = disruption({ id: "stale", state: "resolved", clearedAt: null, flaggedAt: daysAgo(30) });
    const fresh = disruption({ id: "fresh", state: "resolved", clearedAt: null, flaggedAt: daysAgo(2) });

    expect(splitVenueDisruptions([stale, fresh], NOW.getTime()).recentlyResolved.map((item) => item.id)).toEqual(["fresh"]);
  });
});

describe("AffectedVenueBookings", () => {
  // SPM-83: nothing to act on means no section at all.
  it("renders nothing when there are no disruptions or only old resolved ones", () => {
    const { container, rerender } = renderPanel([]);
    expect(container).toBeEmptyDOMElement();

    rerender(
      <MemoryRouter>
        <AffectedVenueBookings
          disruptions={[disruption({ state: "resolved", clearedAt: daysAgo(RESOLVED_VISIBLE_DAYS + 5) })]}
        />
      </MemoryRouter>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists open items in a table with their state", () => {
    renderPanel([
      disruption({ id: "a" }),
      disruption({ id: "b", eventId: "e-2", eventTitle: "Workshop", state: "replacement_requested" }),
    ]);

    const section = screen.getByRole("region", { name: "Affected venue bookings" });
    expect(within(section).getByText("2 open")).toBeInTheDocument();
    expect(within(section).getByText(/have not been cancelled/)).toBeInTheDocument();
    const table = within(section).getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Event", "Venue", "Booking period", "Reason", "Status", "Action",
    ]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByRole("link", { name: "Career Fair" })).toHaveAttribute("href", "/events/e-1/venue");
    expect(within(rows[0]!).getByText("Auditorium")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Maintenance – Air-conditioning repair")).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Replacement Required")).toBeInTheDocument();
    expect(within(rows[1]!).getByText("Replacement Requested")).toBeInTheDocument();
  });

  // SPM-82: the table is the way into replacing a disrupted booking.
  it("offers Find replacement for an open row, View request once one is pending, and nothing for resolved", async () => {
    const user = userEvent.setup();
    renderPanel([
      disruption({ id: "a" }),
      disruption({ id: "b", eventId: "e-2", eventTitle: "Workshop", state: "replacement_requested", replacementBookingId: "r-1" }),
      disruption({ id: "c", eventId: "e-3", eventTitle: "Old Event", state: "resolved", clearedAt: daysAgo(2) }),
    ]);

    expect(screen.getByRole("link", { name: "Find replacement" })).toHaveAttribute("href", "/events/e-1/venue");
    expect(screen.getByRole("link", { name: "View request" })).toHaveAttribute("href", "/events/e-2/venue");

    await user.click(screen.getByRole("button", { name: "Show resolved (1)" }));
    const resolvedRow = screen.getByText("Old Event").closest("tr")!;
    expect(within(resolvedRow).queryByRole("link", { name: /replacement|request/i })).not.toBeInTheDocument();
  });

  // SPM-83: Resolved stays reachable but out of the way.
  it("hides resolved rows until the toggle is used", async () => {
    const user = userEvent.setup();
    renderPanel([
      disruption({ id: "open" }),
      disruption({ id: "done", eventTitle: "Old Event", state: "resolved", clearedAt: daysAgo(3) }),
    ]);

    expect(screen.queryByText("Old Event")).not.toBeInTheDocument();
    const toggle = screen.getByRole("button", { name: "Show resolved (1)" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);
    expect(screen.getByText("Old Event")).toBeInTheDocument();
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide resolved" })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "Hide resolved" }));
    expect(screen.queryByText("Old Event")).not.toBeInTheDocument();
  });

  it("keeps the section, with an empty message, when only recently resolved items exist", async () => {
    const user = userEvent.setup();
    renderPanel([disruption({ state: "resolved", clearedAt: daysAgo(1) })]);

    expect(screen.getByText("No open affected bookings.")).toBeInTheDocument();
    expect(screen.queryByText(/open$/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show resolved (1)" }));
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("does not offer the toggle when nothing was resolved recently", () => {
    renderPanel([
      disruption(),
      disruption({ id: "old", state: "resolved", clearedAt: daysAgo(RESOLVED_VISIBLE_DAYS + 3) }),
    ]);

    expect(screen.queryByRole("button", { name: /resolved/i })).not.toBeInTheDocument();
  });

  it("shows the load error instead of the section", () => {
    renderPanel([disruption()], "We couldn't load your affected venue bookings.");

    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't load your affected venue bookings.");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });
});
