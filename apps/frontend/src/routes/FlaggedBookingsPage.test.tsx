import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FlaggedBookingConflict } from "@/features/venues/services/venues";

const listFlaggedBookingConflictsMock = vi.fn();
const recheckAllVenueConflictsMock = vi.fn();
const authState = {
  profile: { full_name: "Daryl", role: "venue_staff" },
  user: { id: "30000000-0000-0000-0000-000000000003" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/venues/services/venues", () => ({
  listFlaggedBookingConflicts: (...args: unknown[]) => listFlaggedBookingConflictsMock(...args),
  recheckAllVenueConflicts: (...args: unknown[]) => recheckAllVenueConflictsMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { FlaggedBookingsPage } from "./FlaggedBookingsPage";

// Same formatter as the page, so expected dates don't depend on the machine's time zone.
const formatDateTime = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
}).format;

function conflict(overrides: Partial<FlaggedBookingConflict> = {}): FlaggedBookingConflict {
  return {
    id: 1,
    bookingId: "booking-1",
    eventId: "event-1",
    eventTitle: "Leadership Summit",
    venueId: "venue-1",
    venueName: "Innovation Hall",
    venueLayouts: ["Theatre"],
    startsAt: "2026-10-20T01:00:00Z",
    endsAt: "2026-10-20T03:00:00Z",
    coordinatorName: "Joyce",
    isResponsible: true,
    cause: "setup_time_changed",
    flaggedAt: "2026-10-09T02:00:00Z",
    conflictingEventTitle: "Orientation Night",
    conflictingBlockReason: null,
    ...overrides,
  };
}

const blockConflict = conflict({
  id: 2,
  bookingId: "booking-2",
  eventId: "event-2",
  eventTitle: "Career Fair",
  venueName: "Exhibition Centre",
  venueLayouts: [],
  coordinatorName: "Jonathan",
  conflictingEventTitle: null,
  conflictingBlockReason: "Annual maintenance",
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/flagged-bookings"]}>
      <Routes>
        <Route path="flagged-bookings" element={<FlaggedBookingsPage />} />
        <Route path="events/:eventId" element={<p>EVENT DETAIL PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  authState.profile = { full_name: "Daryl", role: "venue_staff" };
  listFlaggedBookingConflictsMock.mockReset().mockResolvedValue([conflict(), blockConflict]);
  recheckAllVenueConflictsMock.mockReset().mockResolvedValue({ flaggedCount: 0, clearedCount: 0 });
});

describe("FlaggedBookingsPage", () => {
  it("shows a loading state until the conflicts arrive", async () => {
    const load = deferred<FlaggedBookingConflict[]>();
    listFlaggedBookingConflictsMock.mockReturnValue(load.promise);
    renderPage();

    expect(screen.getByRole("heading", { name: "Flagged bookings" })).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    load.resolve([conflict()]);

    expect(await screen.findByRole("article")).toBeInTheDocument();
  });

  it("shows the empty state when no booking is flagged", async () => {
    listFlaggedBookingConflictsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole("heading", { name: "No flagged bookings" })).toBeInTheDocument();
    expect(
      screen.getByText("Every Pending and Approved booking currently fits without a scheduling conflict."),
    ).toBeInTheDocument();
  });

  it("lists every unresolved conflict as a Needs Review card", async () => {
    renderPage();

    const cards = await screen.findAllByRole("article");
    expect(cards).toHaveLength(2);
    expect(screen.getAllByText("Conflict – Needs Review")).toHaveLength(2);
  });

  describe("a conflict with another booking", () => {
    it("shows the event, venue, period, coordinator, clashing booking and flagged time", async () => {
      renderPage();

      const card = (await screen.findAllByRole("article"))[0]!;
      expect(within(card).getByRole("link", { name: "Leadership Summit" })).toHaveAttribute(
        "href",
        "/events/event-1",
      );
      expect(within(card).getByText("Innovation Hall")).toBeInTheDocument();
      expect(
        within(card).getByText(
          `${formatDateTime(new Date("2026-10-20T01:00:00Z"))} – ${formatDateTime(new Date("2026-10-20T03:00:00Z"))}`,
        ),
      ).toBeInTheDocument();
      expect(within(card).getByText("Joyce")).toBeInTheDocument();
      expect(within(card).getByText('Booking: "Orientation Night"')).toBeInTheDocument();
      expect(within(card).getByText(formatDateTime(new Date("2026-10-09T02:00:00Z")))).toBeInTheDocument();
      expect(
        within(card).getByText(
          'This booking clashes with another booking ("Orientation Night"). The event coordinator (Joyce) would resolve this conflict soon.',
        ),
      ).toBeInTheDocument();
    });

    it("shows the venue's layout photo when it has a known layout", async () => {
      renderPage();

      const card = (await screen.findAllByRole("article"))[0]!;
      expect(card.querySelector("img")).toBeInTheDocument();
    });

    it("opens the event when the title is selected", async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("link", { name: "Leadership Summit" }));

      expect(await screen.findByText("EVENT DETAIL PAGE")).toBeInTheDocument();
    });
  });

  describe("a conflict with a venue block", () => {
    it("names the block's reason instead of a booking", async () => {
      renderPage();

      const card = (await screen.findAllByRole("article"))[1]!;
      expect(within(card).getByText('Block: "Annual maintenance"')).toBeInTheDocument();
      expect(
        within(card).getByText(
          'This booking clashes with a venue block ("Annual maintenance"). The event coordinator (Jonathan) would resolve this conflict soon.',
        ),
      ).toBeInTheDocument();
      // No known layout -> placeholder icon instead of a photo.
      expect(card.querySelector("img")).not.toBeInTheDocument();
    });

    it("says the reason was not recorded when the block has none", async () => {
      listFlaggedBookingConflictsMock.mockResolvedValue([
        { ...blockConflict, conflictingBlockReason: null },
      ]);
      renderPage();

      expect(await screen.findByText('Block: "Reason not recorded"')).toBeInTheDocument();
      expect(screen.getByText(/clashes with a venue block \("Reason not recorded"\)/)).toBeInTheDocument();
    });
  });

  it("shows Unassigned when the event has no coordinator", async () => {
    listFlaggedBookingConflictsMock.mockResolvedValue([conflict({ coordinatorName: null })]);
    renderPage();

    expect(await screen.findByText("Unassigned")).toBeInTheDocument();
    expect(screen.getByText(/The event coordinator \(the assigned coordinator\)/)).toBeInTheDocument();
  });

  describe("search", () => {
    it.each([
      ["event title", "summit", "Leadership Summit"],
      ["venue name", "EXHIBITION", "Career Fair"],
      ["coordinator", "jonathan", "Career Fair"],
    ])("filters by %s, ignoring case", async (_label, query, remainingEvent) => {
      const user = userEvent.setup();
      renderPage();
      await screen.findAllByRole("article");

      await user.type(screen.getByPlaceholderText("Search by event or venue"), query);

      const cards = screen.getAllByRole("article");
      expect(cards).toHaveLength(1);
      expect(within(cards[0]!).getByRole("link", { name: remainingEvent })).toBeInTheDocument();
    });

    it("shows every conflict again when the search is only spaces", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findAllByRole("article");

      await user.type(screen.getByPlaceholderText("Search by event or venue"), "   ");

      expect(screen.getAllByRole("article")).toHaveLength(2);
    });

    it("explains when nothing matches the search", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findAllByRole("article");

      await user.type(screen.getByPlaceholderText("Search by event or venue"), "no such event");

      expect(screen.getByRole("heading", { name: "No matching flagged bookings" })).toBeInTheDocument();
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
    });
  });

  describe("re-check all venues", () => {
    it("re-checks, reports the counts and reloads the list", async () => {
      const user = userEvent.setup();
      recheckAllVenueConflictsMock.mockResolvedValue({ flaggedCount: 3, clearedCount: 1 });
      renderPage();
      await screen.findAllByRole("article");
      listFlaggedBookingConflictsMock.mockResolvedValue([conflict()]);

      await user.click(screen.getByRole("button", { name: "Re-check all venues" }));

      expect(
        await screen.findByText(
          "Re-checked every venue — 3 newly flagged, 1 cleared since the last re-check. Already-flagged bookings below are unaffected.",
        ),
      ).toBeInTheDocument();
      expect(recheckAllVenueConflictsMock).toHaveBeenCalledTimes(1);
      expect(listFlaggedBookingConflictsMock).toHaveBeenCalledTimes(2);
      expect(await screen.findAllByRole("article")).toHaveLength(1);
    });

    it("disables the button and shows progress while re-checking", async () => {
      const user = userEvent.setup();
      const recheck = deferred<{ flaggedCount: number; clearedCount: number }>();
      recheckAllVenueConflictsMock.mockReturnValue(recheck.promise);
      renderPage();
      await screen.findAllByRole("article");

      await user.click(screen.getByRole("button", { name: "Re-check all venues" }));

      expect(screen.getByRole("button", { name: "Re-checking…" })).toBeDisabled();

      recheck.resolve({ flaggedCount: 0, clearedCount: 0 });

      expect(await screen.findByRole("button", { name: "Re-check all venues" })).toBeEnabled();
    });

    it.each([
      ["an Error", new Error("Only venue staff can re-check venue conflicts"), "Only venue staff can re-check venue conflicts"],
      ["a non-Error value", "boom", "Venues could not be re-checked."],
    ])("shows the error when the re-check throws %s", async (_label, failure, message) => {
      const user = userEvent.setup();
      recheckAllVenueConflictsMock.mockRejectedValue(failure);
      renderPage();
      await screen.findAllByRole("article");

      await user.click(screen.getByRole("button", { name: "Re-check all venues" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(screen.getByRole("button", { name: "Re-check all venues" })).toBeEnabled();
      expect(listFlaggedBookingConflictsMock).toHaveBeenCalledTimes(1);
    });
  });

  it.each([
    ["an Error", new Error("Flagged bookings are unavailable."), "Flagged bookings are unavailable."],
    ["a non-Error value", "boom", "We couldn't load flagged bookings."],
  ])("shows the error when loading throws %s", async (_label, failure, message) => {
    listFlaggedBookingConflictsMock.mockRejectedValue(failure);
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });

  it("tells a role without the Flagged section that access is denied", () => {
    authState.profile = { full_name: "Jasmine", role: "event_organiser" };
    renderPage();

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Flagged bookings" })).not.toBeInTheDocument();
  });
});
