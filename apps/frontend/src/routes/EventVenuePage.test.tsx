import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const listVenueBookingsForEventMock = vi.fn();
const withdrawVenueBookingRequestMock = vi.fn();
const confirmVenueBookingHoldMock = vi.fn();
const setMainVenueBookingMock = vi.fn();
const listSuggestedVenuesMock = vi.fn();
const listVenueDisruptionsMock = vi.fn();
const listEventVenueConflictsMock = vi.fn();
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
  listVenueBookingsForEvent: (...args: unknown[]) => listVenueBookingsForEventMock(...args),
  withdrawVenueBookingRequest: (...args: unknown[]) => withdrawVenueBookingRequestMock(...args),
  confirmVenueBookingHold: (...args: unknown[]) => confirmVenueBookingHoldMock(...args),
  setMainVenueBooking: (...args: unknown[]) => setMainVenueBookingMock(...args),
}));

vi.mock("@/features/venues/services/venue-disruptions", () => ({
  listVenueDisruptionsForCoordinator: (...args: unknown[]) => listVenueDisruptionsMock(...args),
}));

vi.mock("@/features/venues/services/event-venue-conflicts", () => ({
  listEventVenueConflicts: (...args: unknown[]) => listEventVenueConflictsMock(...args),
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

// ManualVenueSearch reads the layout options from the catalogue.
vi.mock("@/features/venues/hooks/use-room-layout-options", () => ({
  useRoomLayoutOptions: () => ["Theatre", "Classroom"],
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/features/safety-check/services/safety-plan", () => ({ saveVenueSafetyChecks: vi.fn() }));

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
  emergencyAccessChecked: false,
  emergencyAccess: null,
  restrictionsChecked: false,
  restrictions: null,
  crowdMovementChecked: false,
  crowdMovementPlan: null,
  safetyCheckFlags: [],
  safetyCheckFlagReason: null,
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

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    status: "pending",
    startsAt: "2099-04-06T02:00:00.000Z",
    endsAt: "2099-04-06T04:00:00.000Z",
    requestedAt: "2099-04-01T00:00:00.000Z",
    decidedAt: null,
    decisionNotes: null,
    expiresAt: null,
    venueId: "venue-1",
    venueName: "Conference Room A",
    venueLayouts: [],
    eventId: "event-1",
    eventTitle: "Career Fair",
    eventExpectedAttendance: 200,
    requestedByName: "Joyce",
    decidedByName: null,
    replacesBookingId: null,
    replacesVenueName: null,
    advisoryNotes: null,
    label: "Main Programme",
    expectedHeadcount: 200,
    isMainVenue: true,
    venueLocation: "Campus",
    venueAreaTags: ["Marina Bay"],
    cancellationReason: null,
    cancelledAt: null,
    cancelledByName: null,
    mainDesignatedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  listVenueBookingsForEventMock.mockReset().mockResolvedValue([]);
  confirmVenueBookingHoldMock.mockReset().mockResolvedValue(undefined);
  setMainVenueBookingMock.mockReset().mockResolvedValue(undefined);
  withdrawVenueBookingRequestMock.mockReset().mockResolvedValue(undefined);
  listSuggestedVenuesMock.mockReset().mockResolvedValue([]);
  listVenueDisruptionsMock.mockReset().mockResolvedValue([]);
  listEventVenueConflictsMock.mockReset().mockResolvedValue([]);
});

describe("EventVenuePage", () => {
  it("shows the suggestions panel when the event has no active booking", async () => {
    renderPage();

    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
    expect(screen.queryByText("Current request")).not.toBeInTheDocument();
  });

  it("AC08: lists the booking with its label, venue, period, headcount and status", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking()]);

    renderPage();

    const list = await screen.findByRole("region", { name: "Venue bookings" });
    expect(within(list).getByText("Main Programme")).toBeInTheDocument();
    expect(within(list).getByText("Main venue")).toBeInTheDocument();
    expect(within(list).getByText("Conference Room A")).toBeInTheDocument();
    expect(within(list).getByText(/200 people/)).toBeInTheDocument();
    expect(within(list).getByText("Pending")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Withdraw request" })).toBeInTheDocument();
  });

  it("AC01: offers Add another venue instead of the event's suggestions once a venue is booked", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking()]);

    renderPage();

    expect(await screen.findByRole("region", { name: "Add another venue" })).toBeInTheDocument();
    expect(screen.queryByText("Suggested venues")).not.toBeInTheDocument();
  });

  it("AC08: lists every booking of the event, active ones first, and marks one as main", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([
      booking({ id: "b-3", label: "Cancelled Room", venueName: "Room C", status: "cancelled", isMainVenue: false }),
      booking({ id: "b-2", label: "Breakout 1", venueName: "Room 2.01", status: "approved", isMainVenue: false, expectedHeadcount: 40 }),
      booking(),
    ]);

    renderPage();

    const list = await screen.findByRole("region", { name: "Venue bookings" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Breakout 1");
    expect(items[0]).toHaveTextContent("Confirmed Booking");
    expect(items[0]).toHaveTextContent("40 people");
    expect(items[1]).toHaveTextContent("Main Programme");
    expect(items[2]).toHaveTextContent("Cancelled Room");
    expect(within(list).getAllByText("Main venue")).toHaveLength(1);
  });

  // Feedback: the coordinator sees why Venue Staff rejected a booking.
  it("shows who rejected a booking, when, and the reason", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([
      booking(),
      booking({
        id: "booking-2", label: "Breakout 1", isMainVenue: false, status: "rejected",
        decidedByName: "Sam Staff", decidedAt: "2099-04-02T00:00:00.000Z",
        decisionNotes: "Room is reserved for exams",
      }),
    ]);

    renderPage();

    const list = await screen.findByRole("region", { name: "Venue bookings" });
    expect(within(list).getByText(/Rejected by Sam Staff on/)).toBeInTheDocument();
    expect(within(list).getByText(/Reason: Room is reserved for exams/)).toBeInTheDocument();
  });

  // SPM-24 AC03: only a Pending request can be withdrawn; an Approved booking is cancelled instead (SPM-85).
  it("offers Cancel booking, not Withdraw, for an Approved booking", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking({ status: "approved" })]);

    renderPage();

    expect(await screen.findByText("Confirmed Booking")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw request" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeInTheDocument();
  });

  // SPM-46 AC07: a Completed event's bookings stay visible, but none can be
  // requested, withdrawn, cancelled, confirmed or made main.
  it("offers no venue booking actions once the event is Completed", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "completed" });
    listVenueBookingsForEventMock.mockResolvedValue([
      booking({ status: "approved" }),
      booking({ id: "booking-2", label: "Breakout 1", isMainVenue: false, status: "pending" }),
      booking({ id: "booking-3", label: "Breakout 2", isMainVenue: false, status: "on_hold", expiresAt: "2099-04-03T00:00:00.000Z" }),
    ]);

    renderPage();

    const list = await screen.findByRole("region", { name: "Venue bookings" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("Main Programme")).toBeInTheDocument();
    expect(within(list).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "This event is completed, so its venue bookings can no longer be changed.",
    );
    expect(screen.queryByText("Suggested venues")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Add another venue" })).not.toBeInTheDocument();
    expect(listSuggestedVenuesMock).not.toHaveBeenCalled();
  });

  // A Cancelled or Rejected event will never need a venue: its bookings stay on
  // record, but no venues are suggested and nothing can be requested.
  it.each(["cancelled", "rejected"])(
    "shows no suggested venues and no booking actions on a %s event",
    async (status) => {
      loadEventDetailMock.mockResolvedValue({ ...event, status });
      listVenueBookingsForEventMock.mockResolvedValue([
        booking({ status: "cancelled", cancellationReason: "Draft." }),
      ]);

      renderPage();

      const list = await screen.findByRole("region", { name: "Venue bookings" });
      expect(within(list).getByText("Main Programme")).toBeInTheDocument();
      expect(within(list).queryByRole("button")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(
        `This event is ${status}, so its venue bookings can no longer be changed.`,
      );
      expect(screen.queryByText("Suggested venues")).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "Add another venue" })).not.toBeInTheDocument();
      expect(listSuggestedVenuesMock).not.toHaveBeenCalled();
    },
  );

  // SPM-46 AC07: with no main venue left, a Completed event is not prompted to choose one.
  it("does not prompt a Completed event to choose a main venue", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "completed" });
    listVenueBookingsForEventMock.mockResolvedValue([booking({ status: "approved", isMainVenue: false })]);

    renderPage();

    await screen.findByRole("region", { name: "Venue bookings" });
    expect(screen.queryByText(/This event has no main venue/)).not.toBeInTheDocument();
  });

  // SPM-24 AC03: withdrawing releases only that booking; SPM-85 AC10: a reason is required.
  it("AC10: asks for a reason before cancelling an Approved booking", async () => {
    listVenueBookingsForEventMock
      .mockResolvedValueOnce([booking({ status: "approved" }), booking({ id: "booking-2", label: "Breakout 1", isMainVenue: false, status: "approved" })])
      .mockResolvedValue([booking({ status: "approved" }), booking({ id: "booking-2", label: "Breakout 1", isMainVenue: false, status: "cancelled", cancellationReason: "Room reserved" })]);
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("region", { name: "Venue bookings" });
    const breakout = within(list).getAllByRole("listitem").find((item) => item.textContent?.includes("Breakout 1"))!;
    await user.click(within(breakout).getByRole("button", { name: "Cancel booking" }));
    expect(await screen.findByText("Cancel confirmed booking: Breakout 1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(await screen.findByText("Give a reason for withdrawing or cancelling this venue booking.")).toBeInTheDocument();
    expect(withdrawVenueBookingRequestMock).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Reason"), "Room reserved");
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    await waitFor(() => expect(withdrawVenueBookingRequestMock).toHaveBeenCalledWith("booking-2", "Room reserved"));
    expect(await screen.findByText("Reason: Room reserved")).toBeInTheDocument();
    // The main booking is untouched.
    expect(within(await screen.findByRole("region", { name: "Venue bookings" })).getAllByText("Confirmed Booking")).toHaveLength(1);
  });

  it("AC10: shows the server's refusal inside the dialog", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking()]);
    withdrawVenueBookingRequestMock.mockRejectedValue(new Error("This booking has a pending replacement. Withdraw the replacement first"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw request" }));
    await user.type(await screen.findByLabelText("Reason"), "x");
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));

    expect(await screen.findByText(/pending replacement/)).toBeInTheDocument();
  });

  // AC07: the coordinator can choose which booking is the main venue.
  it("AC07: makes another booking the main venue", async () => {
    const second = booking({ id: "booking-2", label: "Breakout 1", isMainVenue: false });
    listVenueBookingsForEventMock
      .mockResolvedValueOnce([booking(), second])
      .mockResolvedValue([booking({ isMainVenue: false }), { ...second, isMainVenue: true }]);
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("region", { name: "Venue bookings" });
    expect(within(list).getAllByRole("button", { name: "Make main venue" })).toHaveLength(1);
    await user.click(within(list).getByRole("button", { name: "Make main venue" }));

    await waitFor(() => expect(setMainVenueBookingMock).toHaveBeenCalledWith("booking-2"));
    const items = within(await screen.findByRole("region", { name: "Venue bookings" })).getAllByRole("listitem");
    expect(items.find((item) => item.textContent?.includes("Breakout 1"))).toHaveTextContent("Main venue");
  });

  // AC11: with the main booking gone, the coordinator is asked to choose another.
  it("AC11: prompts to choose a main venue when the main booking is no longer active", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([
      booking({ status: "cancelled" }),
      booking({ id: "booking-2", label: "Breakout 1", isMainVenue: false }),
    ]);

    renderPage();

    expect(await screen.findByText(/This event has no main venue/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Make main venue" })).toBeInTheDocument();
  });

  it("does not prompt while an active main booking exists", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking()]);

    renderPage();

    await screen.findByRole("region", { name: "Venue bookings" });
    expect(screen.queryByText(/This event has no main venue/)).not.toBeInTheDocument();
  });

  it("AC10: withdraws only that booking and shows suggestions again when none is left", async () => {
    listVenueBookingsForEventMock.mockResolvedValueOnce([booking()]).mockResolvedValue([booking({ status: "cancelled" })]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw request" }));
    await user.type(await screen.findByLabelText("Reason"), "Speaker dropped out");
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));

    await waitFor(() =>
      expect(withdrawVenueBookingRequestMock).toHaveBeenCalledWith("booking-1", "Speaker dropped out"),
    );
    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
  });

  it("AC01/AC05: Add another venue asks for a label and starts without the event's attendance", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking()]);
    const user = userEvent.setup();
    renderPage();

    const panel = await screen.findByRole("region", { name: "Add another venue" });
    await user.click(within(panel).getByRole("button", { name: "Add another venue" }));

    expect(await screen.findByLabelText("Booking label *")).toHaveValue("");
    expect(screen.getByLabelText("Number of people (minimum capacity) *")).toHaveValue(null);
    // The main venue's area is the starting location.
    expect(screen.getByLabelText("Location")).toHaveValue("Marina Bay");

    await user.click(screen.getByRole("button", { name: "Search venues" }));
    expect(await screen.findByText("Give this booking a label, for example Breakout 1")).toBeInTheDocument();
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
  const approvedOriginal = booking({ venueName: "Auditorium", status: "approved" });
  const pendingReplacement = booking({
    id: "booking-2", venueId: "venue-2", venueName: "Grand Hall", replacesBookingId: "booking-1",
  });

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
    listVenueBookingsForEventMock.mockResolvedValue([approvedOriginal]);
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
    listVenueBookingsForEventMock
      .mockResolvedValueOnce([approvedOriginal, pendingReplacement])
      .mockResolvedValue([approvedOriginal, { ...pendingReplacement, status: "cancelled" }]);
    listVenueDisruptionsMock
      .mockResolvedValueOnce([{ ...disruption, replacementBookingId: "booking-2", state: "replacement_requested" }])
      .mockResolvedValue([disruption]);
    const user = userEvent.setup();

    renderPage();

    const bookingsList = await screen.findByRole("region", { name: "Venue bookings" });
    expect(within(bookingsList).getByText("Replacement")).toBeInTheDocument();
    expect(within(bookingsList).getByText("Grand Hall")).toBeInTheDocument();
    const card = screen.getByRole("region", { name: "Disrupted venue booking" });
    expect(within(card).getByText("Replacement Requested")).toBeInTheDocument();
    expect(within(card).getByText(/stays until Venue Staff approve it/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Withdraw request" }));
    await user.type(await screen.findByLabelText("Reason"), "Not needed");
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));

    await waitFor(() => expect(withdrawVenueBookingRequestMock).toHaveBeenCalledWith("booking-2", "Not needed"));
    // The original is still disrupted, so the replacement choice is offered again.
    const refreshed = await screen.findByRole("region", { name: "Disrupted venue booking" });
    expect(within(refreshed).getByText("Replacement Required")).toBeInTheDocument();
  });

  // 202611010015: a booking that has to move because of a conflict is
  // replaced the way a disrupted one is, and can't be cancelled by hand.
  const movingConflict = {
      bookingId: "booking-1", mustMove: true, conflictingEventTitle: "F1 Event Part 1",
      conflictingStartsAt: "2099-04-06T00:00:00.000Z", conflictingEndsAt: "2099-04-06T01:45:00.000Z",
      blockReason: null, blockStartsAt: null, blockEndsAt: null, flaggedAt: "2099-04-02T00:00:00.000Z",
    };

  it("shows the conflicting booking and offers other venues as its replacement", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([approvedOriginal]);
    listEventVenueConflictsMock.mockResolvedValue([movingConflict]);
    listSuggestedVenuesMock.mockResolvedValue([
      suggestedVenue("venue-1", "Auditorium"),
      suggestedVenue("venue-2", "Grand Hall"),
    ]);

    renderPage();

    const card = await screen.findByRole("region", { name: "Venue conflict" });
    expect(within(card).getByText("Auditorium")).toBeInTheDocument();
    expect(within(card).getByText("Replacement Required")).toBeInTheDocument();
    expect(within(card).getByText(/Clashes with "F1 Event Part 1" \(6 Apr 2099, 8:00 am – 6 Apr 2099, 9:45 am\), which was booked first/))
      .toBeInTheDocument();
    expect(within(card).getByText(/no longer suitable for the event/)).toBeInTheDocument();

    const bookingsList = screen.getByRole("region", { name: "Venue bookings" });
    expect(within(bookingsList).getByText("Conflict")).toBeInTheDocument();
    expect(within(bookingsList).getByText(/clashes with another booking\. The booking stays until its replacement is approved/))
      .toBeInTheDocument();
    expect(within(bookingsList).queryByRole("button", { name: "Cancel booking" })).not.toBeInTheDocument();

    expect(await screen.findByText("Grand Hall")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/venues/venue-2?forEvent=event-1&status=available&replaces=booking-1",
    );
  });

  it("shows a requested replacement for the conflicting booking", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([approvedOriginal, pendingReplacement]);
    listEventVenueConflictsMock.mockResolvedValue([movingConflict]);

    renderPage();

    const card = await screen.findByRole("region", { name: "Venue conflict" });
    expect(within(card).getByText("Replacement Requested")).toBeInTheDocument();
    expect(within(card).getByText(/stays until Venue Staff approve it/)).toBeInTheDocument();
    expect(screen.queryByText("Suggested venues")).not.toBeInTheDocument();
  });

  it("keeps Cancel booking for the booking made first, which stays", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([approvedOriginal]);
    listEventVenueConflictsMock.mockResolvedValue([{ ...movingConflict, mustMove: false, conflictingEventTitle: "F1 Event Part 2" }]);

    renderPage();

    expect(await screen.findByText(/No action is needed from you/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Venue conflict" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel booking" })).toBeInTheDocument();
  });

  it("does not show a disruption that is already resolved", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([pendingReplacement]);
    listVenueDisruptionsMock.mockResolvedValue([{ ...disruption, state: "resolved", clearedAt: "2099-04-02T00:00:00.000Z" }]);

    renderPage();

    expect(await screen.findByRole("region", { name: "Venue bookings" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Disrupted venue booking" })).not.toBeInTheDocument();
  });

  it("still works when the disruptions cannot be loaded", async () => {
    listVenueDisruptionsMock.mockRejectedValue(new Error("boom"));

    renderPage();

    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Disrupted venue booking" })).not.toBeInTheDocument();
  });
});

// SPM-85 / SPM-82: loading the event's venue page, and what it shows when information is missing.
describe("EventVenuePage loading and details", () => {
  it("says why the event could not be loaded, with a plain message when none is given", async () => {
    loadEventDetailMock.mockRejectedValueOnce(new Error("Event not found"));
    const failed = renderPage();
    expect(await screen.findByText("Event unavailable")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Event not found");
    failed.unmount();

    loadEventDetailMock.mockRejectedValueOnce("boom");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("This event is unavailable or you do not have access to it.");
  });

  it("loads nothing and shows no venue information when the page address names no event", () => {
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="events" element={<EventVenuePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(loadEventDetailMock).not.toHaveBeenCalled();
    expect(screen.queryByText("Suggested venues")).not.toBeInTheDocument();
  });

  it("ignores a response that arrives after the coordinator has left the page", async () => {
    let resolveEvent: (value: unknown) => void = () => {};
    loadEventDetailMock.mockReturnValueOnce(new Promise((resolve) => { resolveEvent = resolve; }));
    const first = renderPage();
    first.unmount();
    resolveEvent(event);

    let rejectEvent: (reason: unknown) => void = () => {};
    loadEventDetailMock.mockReturnValueOnce(new Promise((_, reject) => { rejectEvent = reject; }));
    const second = renderPage();
    second.unmount();
    rejectEvent(new Error("too late"));

    await waitFor(() => expect(loadEventDetailMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Event unavailable")).not.toBeInTheDocument();
    expect(screen.queryByText("Career Fair")).not.toBeInTheDocument();
  });

  it("says 'Not provided' for event details the organiser left out", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...event,
      startsAt: null,
      endsAt: null,
      expectedAttendance: null,
      venue: { ...event.venue, preferredLocation: "", facilities: [] },
    });
    renderPage();

    expect(await screen.findByText("Suggested venues")).toBeInTheDocument();
    expect(screen.getAllByText("Not provided").length).toBeGreaterThanOrEqual(3);
  });

  it("lists the facilities the event requires", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, venue: { ...event.venue, facilities: ["Projector", "Microphone"] } });
    renderPage();

    expect(await screen.findByText("Projector")).toBeInTheDocument();
    expect(screen.getByText("Microphone")).toBeInTheDocument();
  });
});

describe("EventVenuePage main venue and disruption details", () => {
  const second = () => booking({ id: "booking-2", label: "Breakout 1", isMainVenue: false });

  // SPM-85 AC07: changing the main venue can fail, and the coordinator is told why next to that booking.
  it("shows why the main venue could not be changed, with a plain message when none is given", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking(), second()]);
    setMainVenueBookingMock.mockRejectedValueOnce(new Error("Only an Approved booking can be the main venue"));
    const user = userEvent.setup();
    renderPage();

    const list = await screen.findByRole("region", { name: "Venue bookings" });
    await user.click(within(list).getByRole("button", { name: "Make main venue" }));
    expect(await screen.findByText("Only an Approved booking can be the main venue")).toBeInTheDocument();

    setMainVenueBookingMock.mockRejectedValueOnce("boom");
    await user.click(within(await screen.findByRole("region", { name: "Venue bookings" })).getByRole("button", { name: "Make main venue" }));
    expect(await screen.findByText("The main venue could not be changed.")).toBeInTheDocument();
  });

  // SPM-82: the block's category is shown on its own when the block has no description.
  it("shows only the block's category when the block has no description", async () => {
    listVenueBookingsForEventMock.mockResolvedValue([booking({ venueName: "Auditorium", status: "approved" })]);
    listVenueDisruptionsMock.mockResolvedValue([
      {
        id: "disruption-1", bookingId: "booking-1", eventId: "event-1", eventTitle: "Career Fair", venueId: "venue-1",
        venueName: "Auditorium", bookingStartsAt: "2099-04-06T02:00:00.000Z", bookingEndsAt: "2099-04-06T04:00:00.000Z",
        blockReasonCategory: "renovation" as const, blockReason: "", blockStartsAt: "2099-04-06T04:00:00.000Z",
        blockEndsAt: "2099-04-06T06:00:00.000Z", flaggedAt: "2099-04-01T00:00:00.000Z", clearedAt: null,
        replacementBookingId: null, state: "replacement_required" as const,
      },
    ]);
    renderPage();

    const card = await screen.findByRole("region", { name: "Disrupted venue booking" });
    expect(within(card).getByText("Renovation")).toBeInTheDocument();
    expect(within(card).queryByText(/Renovation –/)).not.toBeInTheDocument();
  });
});

// SPM-90: the Venue step's safety checks sit at the bottom of the page.
describe("EventVenuePage safety checks", () => {
  it("lets the assigned coordinator tick the safety checks during Planning", async () => {
    renderPage();

    const checks = await screen.findByRole("region", { name: "Safety checks" });
    expect(within(checks).getByRole("checkbox", { name: "Emergency access checked" })).not.toBeChecked();
    expect(within(checks).getByRole("checkbox", { name: "Known restrictions checked" })).toBeInTheDocument();
    expect(within(checks).getByRole("checkbox", { name: "Crowd movement planned" })).toBeInTheDocument();
    expect(within(checks).getByRole("button", { name: "Save safety checks" })).toBeInTheDocument();
  });

  it("shows them read-only once the event has left Planning", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "pending_safety_check", emergencyAccessChecked: true });
    renderPage();

    const checks = await screen.findByRole("region", { name: "Safety checks" });
    expect(within(checks).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(within(checks).getByRole("img", { name: "Checked" })).toBeInTheDocument();
  });

  it("shows the coordinator which check the Safety Officer asked them to revise", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...event,
      safetyCheckFlags: ["emergency_access"],
      safetyCheckFlagReason: "The rear exit is blocked by the stage.",
    });
    renderPage();

    const checks = await screen.findByRole("region", { name: "Safety checks" });
    expect(
      within(checks).getByText("The Safety Officer asked for this to be revised: The rear exit is blocked by the stage."),
    ).toBeInTheDocument();
    expect(within(checks).getAllByText(/asked for this to be revised/)).toHaveLength(1);
  });
});
