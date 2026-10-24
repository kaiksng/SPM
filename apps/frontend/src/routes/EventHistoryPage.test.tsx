import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listClarificationsMock = vi.fn();
const loadEventFieldHistoryMock = vi.fn();
const listEventDecisionsMock = vi.fn();
const listEventStatusHistoryMock = vi.fn();
const loadEventDetailMock = vi.fn();
const loadEquipmentHistoryMock = vi.fn();
const listSafetyCheckDecisionsMock = vi.fn();
const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "20000000-0000-0000-0000-000000000002" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
}));

const listEventChangeRequestsMock = vi.fn();
vi.mock("@/features/event-requests/services/change-requests", () => ({
  listEventChangeRequests: (...args: unknown[]) => listEventChangeRequestsMock(...args),
}));

vi.mock("@/features/event-requests/services/field-history", () => ({
  loadEventFieldHistory: (...args: unknown[]) => loadEventFieldHistoryMock(...args),
}));

vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

vi.mock("@/features/event-requests/services/decisions", () => ({
  listEventDecisions: (...args: unknown[]) => listEventDecisionsMock(...args),
}));

vi.mock("@/features/event-requests/services/event-lifecycle", () => ({
  listEventStatusHistory: (...args: unknown[]) => listEventStatusHistoryMock(...args),
}));

// Without this the page made a real network call, so every test here passed
// or timed out depending on connectivity.
vi.mock("@/features/event-requests/services/event-reassignment", () => ({
  listEventCoordinatorReassignments: vi.fn().mockResolvedValue([]),
  listEventCoordinatorAssignmentHistory: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/event-requests/services/equipment", () => ({
  loadEquipmentHistory: (...args: unknown[]) => loadEquipmentHistoryMock(...args),
}));

const listVenueBookingsForEventMock = vi.fn();
const listVenueDisruptionsMock = vi.fn();
vi.mock("@/features/venues/services/venue-disruptions", () => ({
  listVenueDisruptionsForCoordinator: (...args: unknown[]) => listVenueDisruptionsMock(...args),
}));
vi.mock("@/features/venues/services/venue-bookings", () => ({
  listVenueBookingsForEvent: (...args: unknown[]) => listVenueBookingsForEventMock(...args),
}));
vi.mock("@/features/safety-check/services/safety-check-decisions", () => ({
  listSafetyCheckDecisions: (...args: unknown[]) => listSafetyCheckDecisionsMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { EventHistoryPage } from "./EventHistoryPage";

const answeredClarification = {
  id: "clarification-1",
  question: "Can you confirm the headcount?",
  response: "It will be 80 attendees.",
  status: "answered" as const,
  permittedFields: ["expectedAttendance"],
  requestedAt: "2026-09-14T08:00:00.000Z",
  respondedAt: "2026-09-14T09:00:00.000Z",
  resolvedAt: null,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/history"]}>
      <Routes>
        <Route path="events/:eventId/history" element={<EventHistoryPage />} />
        <Route path="events/:eventId" element={<p>EVENT DETAIL PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listClarificationsMock.mockReset().mockResolvedValue([]);
  listEventChangeRequestsMock.mockReset().mockResolvedValue([]);
  loadEventFieldHistoryMock.mockReset().mockResolvedValue([]);
  listEventDecisionsMock.mockReset().mockResolvedValue([]);
  listEventStatusHistoryMock.mockReset().mockResolvedValue([]);
  loadEquipmentHistoryMock.mockReset().mockResolvedValue([]);
  listVenueBookingsForEventMock.mockReset().mockResolvedValue([]);
  listVenueDisruptionsMock.mockReset().mockResolvedValue([]);
  listSafetyCheckDecisionsMock.mockReset().mockResolvedValue([]);
  loadEventDetailMock.mockReset().mockResolvedValue({
    assignedCoordinatorId: "20000000-0000-0000-0000-000000000002",
  });
});

const baseBooking = {
  startsAt: "2099-04-06T02:00:00.000Z",
  endsAt: "2099-04-06T04:00:00.000Z",
  decidedAt: null,
  decisionNotes: null,
  expiresAt: null,
  venueLayouts: [],
  eventId: "event-1",
  eventTitle: "Career Fair",
  eventExpectedAttendance: 50,
  requestedByName: "Priya",
  decidedByName: null,
  advisoryNotes: null,
  label: "Main Programme",
  expectedHeadcount: 50,
  isMainVenue: true,
  venueLocation: "City Hall",
  venueAreaTags: [] as string[],
  cancellationReason: null,
  cancelledAt: null,
  cancelledByName: null,
  mainDesignatedAt: null,
};

describe("EventHistoryPage", () => {
  // SPM-85 AC12: every change to a booking is recorded with the booking's label,
  // as one time-ordered log (newest first).
  describe("venue booking activity", () => {
    const main = {
      ...baseBooking, id: "booking-1", status: "approved" as const, venueId: "venue-1",
      venueName: "Main Hall", requestedAt: "2099-04-01T00:00:00.000Z",
      replacesBookingId: null, replacesVenueName: null,
      decidedAt: "2099-04-01T01:00:00.000Z", decidedByName: "Sam Staff",
      mainDesignatedAt: "2099-04-01T00:00:00.000Z",
    };
    const breakout = {
      ...baseBooking, id: "booking-2", status: "cancelled" as const, venueId: "venue-2",
      venueName: "Room 2.01", requestedAt: "2099-04-02T00:00:00.000Z",
      replacesBookingId: null, replacesVenueName: null, label: "Breakout 1", isMainVenue: false,
      expectedHeadcount: 40, decidedAt: "2099-04-02T01:00:00.000Z", decidedByName: "Sam Staff",
      cancelledAt: "2099-04-03T00:00:00.000Z", cancelledByName: "Priya",
      cancellationReason: "Speaker dropped out",
    };

    it("AC12: names each entry by the booking's label and venue", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([main, breakout]);
      renderPage();

      const section = (await screen.findByRole("heading", { name: "Venue bookings" })).closest("section")!;
      expect(within(section).getAllByText("Main Programme").length).toBeGreaterThan(0);
      expect(within(section).getAllByText("Breakout 1").length).toBeGreaterThan(0);
      expect(within(section).getAllByText("Main Hall").length).toBeGreaterThan(0);
      expect(within(section).getAllByText("Room 2.01").length).toBeGreaterThan(0);
    });

    it("AC12: lists the steps newest first, so a cancellation comes before the request", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([breakout]);
      renderPage();

      const section = (await screen.findByRole("heading", { name: "Venue bookings" })).closest("section")!;
      const titles = within(section).getAllByRole("listitem").map((item) => item.textContent ?? "");
      expect(titles[0]).toContain("Cancelled");
      expect(titles[1]).toContain("Approved");
      expect(titles[2]).toContain("Requested");
    });

    it("AC12: records who cancelled a booking, and why", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([main, breakout]);
      renderPage();

      const cancelled = (await screen.findByText("Cancelled")).closest("li")!;
      expect(within(cancelled).getByText("by Priya")).toBeInTheDocument();
      expect(within(cancelled).getByText('Reason: "Speaker dropped out"')).toBeInTheDocument();
    });

    // Feedback: the rejection reason is part of the history too.
    it("shows who rejected a booking and the reason", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([
        { ...breakout, status: "rejected" as const, cancelledAt: null, cancelledByName: null,
          cancellationReason: null, decisionNotes: "Room is reserved for exams" },
      ]);
      renderPage();

      expect(await screen.findByText("Rejected")).toBeInTheDocument();
      expect(screen.getByText('Reason: "Room is reserved for exams"')).toBeInTheDocument();
    });

    // Venue hold AC04: an expired hold stays visible in the event's change history.
    it("AC04 (venue hold): keeps an expired hold in the history, after its request", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([
        { ...breakout, status: "expired" as const, decidedAt: null, decidedByName: null, cancelledAt: null,
          cancelledByName: null, cancellationReason: null, expiresAt: "2099-04-02T12:00:00.000Z" },
      ]);
      renderPage();

      const section = (await screen.findByRole("heading", { name: "Venue bookings" })).closest("section")!;
      const titles = within(section).getAllByRole("listitem").map((item) => item.textContent ?? "");
      expect(titles).toHaveLength(2);
      expect(titles[0]).toContain("Hold expired");
      expect(titles[0]).toContain("Breakout 1");
      expect(titles[1]).toContain("Requested");
    });

    it("records when a booking became the main venue, but not for the first booking", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([
        main,
        { ...breakout, status: "approved" as const, cancelledAt: null, mainDesignatedAt: "2099-04-05T00:00:00.000Z" },
      ]);
      renderPage();

      expect(await screen.findByText("Became the main venue")).toBeInTheDocument();
      expect(screen.getAllByText("Became the main venue")).toHaveLength(1);
    });
  });

  // SPM-82 AC09: the disrupted booking and its replacement are linked and visible.
  describe("venue booking replacements", () => {
    const original = {
      ...baseBooking, id: "booking-1", status: "cancelled" as const, venueId: "venue-1",
      venueName: "Auditorium", requestedAt: "2099-04-01T00:00:00.000Z",
      replacesBookingId: null, replacesVenueName: null,
    };
    const replacement = {
      ...baseBooking, id: "booking-2", status: "approved" as const, venueId: "venue-2",
      venueName: "Grand Hall", requestedAt: "2099-04-02T00:00:00.000Z",
      decidedAt: "2099-04-03T00:00:00.000Z", decidedByName: "Sam Staff",
      replacesBookingId: "booking-1", replacesVenueName: "Auditorium",
    };

    it("links an approved replacement and the booking it replaced in both directions", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([original, replacement]);
      renderPage();

      expect(await screen.findByText("Replaced by the booking at Grand Hall")).toBeInTheDocument();
      expect(screen.getByText(/Replacement for the disrupted booking at Auditorium/)).toBeInTheDocument();
    });

    it("says a replacement was requested, not made, while it is still pending", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([
        { ...original, status: "approved" as const },
        { ...replacement, status: "pending" as const, decidedAt: null, decidedByName: null },
      ]);
      renderPage();

      expect(await screen.findByText("Replacement requested at Grand Hall")).toBeInTheDocument();
      expect(screen.queryByText(/Replaced by the booking/)).not.toBeInTheDocument();
    });

    it("does not claim the original was replaced after a rejected or withdrawn attempt", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([
        { ...original, status: "approved" as const },
        { ...replacement, status: "rejected" as const, decidedAt: "2099-04-03T00:00:00.000Z" },
      ]);
      renderPage();

      await screen.findAllByText("Grand Hall");
      expect(screen.queryByText(/Replaced by the booking/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Replacement requested at/)).not.toBeInTheDocument();
      // The attempt itself is still listed with what it was for.
      expect(screen.getByText(/Replacement for the disrupted booking at Auditorium/)).toBeInTheDocument();
    });

    // SPM-83: a venue block that disrupts a booking is part of its log.
    it("logs a booking that is currently disrupted", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      listVenueDisruptionsMock.mockResolvedValue([
        { eventId: "event-1", bookingId: "booking-1", state: "replacement_required", flaggedAt: "2099-04-04T00:00:00.000Z" },
      ]);
      renderPage();

      expect(await screen.findByText("Disrupted")).toBeInTheDocument();
      expect(screen.getByText(/The venue became unavailable/)).toBeInTheDocument();
    });

    it("does not log a disruption that is resolved, or one on another event", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      listVenueDisruptionsMock.mockResolvedValue([
        { eventId: "event-1", bookingId: "booking-1", state: "resolved", flaggedAt: "2099-04-04T00:00:00.000Z" },
        { eventId: "other-event", bookingId: "booking-1", state: "replacement_required", flaggedAt: "2099-04-04T00:00:00.000Z" },
      ]);
      renderPage();

      await screen.findAllByText("Auditorium");
      expect(screen.queryByText("Disrupted")).not.toBeInTheDocument();
    });

    it("still lists the bookings when the disruptions cannot be loaded", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      listVenueDisruptionsMock.mockRejectedValue(new Error("boom"));
      renderPage();

      expect((await screen.findAllByText("Auditorium")).length).toBeGreaterThan(0);
      expect(screen.queryByText("Disrupted")).not.toBeInTheDocument();
    });

    it("shows nothing extra for an ordinary booking", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      renderPage();

      await screen.findAllByText("Auditorium");
      expect(screen.queryByText(/Replace/)).not.toBeInTheDocument();
    });
  });

  describe("filter", () => {
    it("shows only the venue entries when Venue is chosen", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([
        { ...baseBooking, id: "booking-1", status: "pending" as const, venueId: "venue-1",
          venueName: "Main Hall", requestedAt: "2099-04-01T00:00:00.000Z", replacesBookingId: null, replacesVenueName: null },
      ]);
      const user = userEvent.setup();
      renderPage();

      await screen.findByRole("heading", { name: "Lifecycle" });
      await user.click(screen.getByRole("button", { name: "Venue" }));

      expect(screen.getByRole("heading", { name: "Venue bookings" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Lifecycle" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Venue" })).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: "All" }));
      expect(screen.getByRole("heading", { name: "Lifecycle" })).toBeInTheDocument();
    });
  });

  it("links back to the main events page", async () => {
    renderPage();

    expect(await screen.findByRole("link", { name: /Back to events/ })).toHaveAttribute(
      "href",
      "/events",
    );
  });

  it("shows empty states for every section when there is no history yet", async () => {
    renderPage();

    expect(await screen.findByText("No status changes recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("No clarification rounds were needed.")).toBeInTheDocument();
    expect(screen.queryByText("Planning")).not.toBeInTheDocument();
  });

  it("shows the Pre-Approved section with clarification rounds", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);

    renderPage();

    expect(await screen.findByText("Pre-Approved")).toBeInTheDocument();
    expect(
      screen.getByText('Coordinator requested 14 Sept 2026, 4:00 pm: "Can you confirm the headcount?"'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Organiser responded/)).toBeInTheDocument();
    expect(screen.queryByText("Planning")).not.toBeInTheDocument();
  });

  // The change-request panel on the event detail page only shows the
  // currently pending request; the full history (including decided and
  // withdrawn ones) lives here instead.
  it("shows the Change requests section with every request's outcome", async () => {
    listEventChangeRequestsMock.mockResolvedValue([
      {
        id: "change-request-1",
        requestedChanges: { description: "Move the start time to 2pm" },
        reason: "Speaker rescheduled",
        status: "rejected",
        reviewNotes: "Too close to the registration deadline.",
        requestedAt: "2026-09-14T08:00:00.000Z",
        reviewedAt: "2026-09-14T09:00:00.000Z",
        withdrawnAt: null,
        implementedAt: null,
      },
    ]);

    renderPage();

    expect(await screen.findByText("Change requests")).toBeInTheDocument();
    expect(screen.getByText("Move the start time to 2pm")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Reason: Speaker rescheduled")).toBeInTheDocument();
    expect(
      screen.getByText("Notes: Too close to the registration deadline."),
    ).toBeInTheDocument();
  });

  it("shows the Lifecycle section", async () => {
    listEventStatusHistoryMock.mockResolvedValue([
      {
        id: 1,
        fromStatus: null,
        toStatus: "draft",
        changedByName: "Jasmine",
        changedAt: "2026-09-10T08:00:00.000Z",
      },
      {
        id: 2,
        fromStatus: "draft",
        toStatus: "requested",
        changedByName: "Jasmine",
        changedAt: "2026-09-11T08:00:00.000Z",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Lifecycle")).toBeInTheDocument();
    expect(screen.getAllByText("draft")).toHaveLength(2);
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  // AC6: each review round's outcome, reason, reviewer and time.
  it("shows the Safety check reviews section", async () => {
    listSafetyCheckDecisionsMock.mockResolvedValue([
      {
        id: 2,
        round: 2,
        outcome: "approved",
        reason: "Looks good now.",
        decidedByName: "Sam Safety",
        decidedAt: "2026-10-20T14:40:00.000Z",
        flaggedBookingIds: [],
        flaggedRequirementIds: [],
      },
      {
        id: 1,
        round: 1,
        outcome: "changes_requested",
        reason: "Reposition the projector away from the exit.",
        decidedByName: "Sam Safety",
        decidedAt: "2026-10-18T16:05:00.000Z",
        flaggedBookingIds: [],
        flaggedRequirementIds: ["req-1"],
      },
    ]);

    renderPage();

    expect(await screen.findByText("Safety check reviews")).toBeInTheDocument();
    expect(screen.getByText("Round 2 · Approved")).toBeInTheDocument();
    expect(screen.getByText("Round 1 · Changes requested")).toBeInTheDocument();
    expect(
      screen.getByText('"Reposition the projector away from the exit."'),
    ).toBeInTheDocument();
    expect(screen.getByText("1 item flagged")).toBeInTheDocument();
  });

  it("does not show the Safety check reviews section when no decision has been made", async () => {
    renderPage();

    await screen.findByText("Lifecycle");
    expect(screen.queryByText("Safety check reviews")).not.toBeInTheDocument();
  });

  it("names the exact field(s) edited during a round, with before/after values", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);
    loadEventFieldHistoryMock.mockResolvedValue([
      {
        id: 1,
        fieldName: "expectedAttendance",
        previousValue: "50",
        newValue: "80",
        changedByName: "Jasmine",
        changedAt: "2026-09-14T08:30:00.000Z",
      },
    ]);

    renderPage();

    const editBlock = await screen.findByText("Organiser has edited these field(s):");
    const container = editBlock.closest("div");
    expect(container?.textContent).toContain("Expected attendance:");
    expect(container?.textContent).toContain("50");
    expect(container?.textContent).toContain("80");
  });

  it("does not attribute a field change to the wrong round", async () => {
    listClarificationsMock.mockResolvedValue([
      { ...answeredClarification, id: "round-1", requestedAt: "2026-09-14T08:00:00.000Z" },
      {
        ...answeredClarification,
        id: "round-2",
        question: "What about the venue?",
        requestedAt: "2026-09-14T10:00:00.000Z",
        respondedAt: "2026-09-14T11:00:00.000Z",
      },
    ]);
    loadEventFieldHistoryMock.mockResolvedValue([
      {
        id: 1,
        fieldName: "expectedAttendance",
        previousValue: "50",
        newValue: "80",
        changedByName: "Jasmine",
        changedAt: "2026-09-14T08:30:00.000Z",
      },
      {
        id: 2,
        fieldName: "venue.preferredLocation",
        previousValue: "Main Hall",
        newValue: "Auditorium",
        changedByName: "Jasmine",
        changedAt: "2026-09-14T10:30:00.000Z",
      },
    ]);

    renderPage();

    const editBlocks = (
      await screen.findAllByText("Organiser has edited these field(s):")
    ).map((node) => node.closest("div"));
    expect(editBlocks).toHaveLength(2);
    expect(editBlocks[0]?.textContent).toContain("Expected attendance:");
    expect(editBlocks[0]?.textContent).not.toContain("Preferred location:");
    expect(editBlocks[1]?.textContent).toContain("Preferred location:");
    expect(editBlocks[1]?.textContent).not.toContain("Expected attendance:");
  });

  it("lists a resolved round's resolution", async () => {
    listClarificationsMock.mockResolvedValue([
      { ...answeredClarification, status: "resolved" as const, resolvedAt: "2026-09-14T10:00:00.000Z" },
    ]);

    renderPage();

    expect(await screen.findByText(/Coordinator resolved/)).toBeInTheDocument();
  });

  it("shows a Planning section for edits made after approval, separate from Pre-Approved", async () => {
    listClarificationsMock.mockResolvedValue([
      { ...answeredClarification, status: "resolved" as const, resolvedAt: "2026-09-14T10:00:00.000Z" },
    ]);
    listEventDecisionsMock.mockResolvedValue([
      {
        id: "decision-1",
        decision: "approved" as const,
        rationale: null,
        decidedAt: "2026-09-14T12:00:00.000Z",
        decidedByName: "Joyce",
      },
    ]);
    loadEventFieldHistoryMock.mockResolvedValue([
      {
        id: 1,
        fieldName: "expectedAttendance",
        previousValue: "50",
        newValue: "80",
        changedByName: "Jasmine",
        changedAt: "2026-09-14T08:30:00.000Z",
      },
      {
        id: 2,
        fieldName: "venue.preferredLocation",
        previousValue: "Main Hall",
        newValue: "Auditorium",
        changedByName: "Joyce",
        changedAt: "2026-09-15T09:00:00.000Z",
      },
    ]);

    renderPage();

    const planning = (await screen.findByText("Planning")).closest("section");
    const preApproved = screen.getByText("Pre-Approved").closest("section");
    expect(preApproved?.textContent).toContain("Expected attendance");
    expect(preApproved?.textContent).not.toContain("Preferred location");
    expect(planning?.textContent).toContain("Preferred location");
    expect(planning?.textContent).not.toContain("Expected attendance");
  });

  it("shows an empty Planning section when approved but nothing has changed since", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);
    listEventDecisionsMock.mockResolvedValue([
      {
        id: "decision-1",
        decision: "approved" as const,
        rationale: null,
        decidedAt: "2026-09-14T12:00:00.000Z",
        decidedByName: "Joyce",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Planning")).toBeInTheDocument();
    expect(
      screen.getByText("No changes have been made since this event was approved."),
    ).toBeInTheDocument();
  });

  it("denies a coordinator who is not assigned to this event (SPM-09 AC02)", async () => {
    loadEventDetailMock.mockResolvedValue({
      assignedCoordinatorId: "20000000-0000-0000-0000-000000000099",
    });

    renderPage();

    expect(
      await screen.findByText("This event is unavailable or you do not have access to it."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Lifecycle")).not.toBeInTheDocument();
  });

  // SPM-09: As an Event Coordinator, I want to view the latest requirements and full
  // change history for an event I'm assigned to, so that I can confirm all internal
  // teams are working from the current agreed information.
  describe("SPM-09: viewing an event's change history", () => {
    const COORDINATOR_ID = "20000000-0000-0000-0000-000000000002";
    const OTHER_COORDINATOR_ID = "20000000-0000-0000-0000-000000000099";
    const ORGANISER_ID = "10000000-0000-0000-0000-000000000001";
    const lifecycleStatuses = [
      "requested",
      "planning",
      "pending_safety_check",
      "confirmed",
      "completed",
      "rejected",
      "cancelled",
    ];

    const approval = {
      id: "decision-1",
      decision: "approved" as const,
      rationale: null,
      decidedAt: "2026-09-14T12:00:00.000Z",
      decidedByName: "Joyce",
    };

    const statusChanges = [
      {
        id: 1,
        fromStatus: null,
        toStatus: "draft",
        changedByName: "Jasmine",
        changedAt: "2026-09-10T08:00:00.000Z",
      },
      {
        id: 2,
        fromStatus: "draft",
        toStatus: "requested",
        changedByName: "Jasmine",
        changedAt: "2026-09-11T08:00:00.000Z",
      },
      {
        id: 3,
        fromStatus: "requested",
        toStatus: "planning",
        changedByName: "Joyce",
        changedAt: "2026-09-14T12:00:00.000Z",
      },
    ];

    const planningEdits = [
      {
        id: 10,
        fieldName: "expectedAttendance",
        previousValue: "80",
        newValue: "120",
        changedByName: "Joyce",
        changedAt: "2026-09-15T01:00:00.000Z",
      },
      {
        id: 11,
        fieldName: "venue.preferredLocation",
        previousValue: "Main Hall",
        newValue: "Auditorium",
        changedByName: "Jasmine",
        changedAt: "2026-09-16T02:30:00.000Z",
      },
    ];

    function section(title: string) {
      return screen.getByRole("heading", { level: 2, name: title }).closest("section")!;
    }

    afterEach(() => {
      authState.profile = { full_name: "Joyce Coordinator", role: "event_coordinator" };
      authState.user.id = COORDINATOR_ID;
    });

    // SPM-09 AC02: an unassigned coordinator is denied, whatever the event's status, even
    // though the history services returned rows.
    it.each(lifecycleStatuses)(
      "denies a coordinator who is not assigned to a %s event",
      async (status) => {
        loadEventDetailMock.mockResolvedValue({ assignedCoordinatorId: OTHER_COORDINATOR_ID, status });
        listEventStatusHistoryMock.mockResolvedValue(statusChanges);
        listEventDecisionsMock.mockResolvedValue([approval]);
        loadEventFieldHistoryMock.mockResolvedValue(planningEdits);

        renderPage();

        expect(
          await screen.findByText("This event is unavailable or you do not have access to it."),
        ).toBeInTheDocument();
        expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
        expect(screen.queryByText(/Jasmine|Joyce/)).not.toBeInTheDocument();
        expect(screen.queryByText("Auditorium")).not.toBeInTheDocument();
      },
    );

    // SPM-09 AC02 (inverse): the assigned coordinator is not denied in any status.
    it.each(lifecycleStatuses)(
      "shows the assigned coordinator the history of a %s event",
      async (status) => {
        loadEventDetailMock.mockResolvedValue({ assignedCoordinatorId: COORDINATOR_ID, status });

        renderPage();

        expect(await screen.findByRole("heading", { level: 2, name: "Lifecycle" })).toBeInTheDocument();
        expect(
          screen.queryByText("This event is unavailable or you do not have access to it."),
        ).not.toBeInTheDocument();
      },
    );

    // SPM-09 AC03: edits made before approval do not count as changes since approval.
    it("says no changes have been made since approval when every edit came before it", async () => {
      listClarificationsMock.mockResolvedValue([answeredClarification]);
      listEventDecisionsMock.mockResolvedValue([approval]);
      loadEventFieldHistoryMock.mockResolvedValue([
        {
          id: 1,
          fieldName: "expectedAttendance",
          previousValue: "50",
          newValue: "80",
          changedByName: "Jasmine",
          changedAt: "2026-09-14T08:30:00.000Z",
        },
      ]);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Planning" });
      const planning = section("Planning");
      expect(planning).toHaveTextContent("No changes have been made since this event was approved.");
      expect(planning).not.toHaveTextContent("Expected attendance");
      expect(planning.querySelector("ol")).toBeNull();
    });

    // SPM-09 AC03: the message replaces the list only while there are no planning edits.
    it("lists planning edits instead of the no-changes message once a field is edited", async () => {
      listEventDecisionsMock.mockResolvedValue([approval]);
      loadEventFieldHistoryMock.mockResolvedValue(planningEdits);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Planning" });
      expect(section("Planning")).not.toHaveTextContent("No changes have been made");
    });

    // SPM-09 AC03: "since approval" needs an approval — a rejection does not open the Planning stage.
    it("does not show a Planning section for a rejected event", async () => {
      listEventDecisionsMock.mockResolvedValue([
        { ...approval, decision: "rejected" as const, rationale: "Not feasible." },
      ]);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Lifecycle" });
      expect(screen.queryByRole("heading", { level: 2, name: "Planning" })).not.toBeInTheDocument();
      expect(screen.queryByText(/No changes have been made since/)).not.toBeInTheDocument();
    });

    // SPM-09 AC04: the organiser is exempt from AC02 even though another coordinator is assigned.
    it.each(["requested", "planning", "confirmed", "cancelled"])(
      "shows the organiser the change history of their own %s event",
      async (status) => {
        authState.profile = { full_name: "Jasmine", role: "event_organiser" };
        authState.user.id = ORGANISER_ID;
        loadEventDetailMock.mockResolvedValue({ assignedCoordinatorId: OTHER_COORDINATOR_ID, status });
        listEventStatusHistoryMock.mockResolvedValue(statusChanges);
        listEventDecisionsMock.mockResolvedValue([approval]);
        loadEventFieldHistoryMock.mockResolvedValue(planningEdits);

        renderPage();

        await screen.findByRole("heading", { level: 2, name: "Lifecycle" });
        expect(
          screen.queryByText("This event is unavailable or you do not have access to it."),
        ).not.toBeInTheDocument();
        expect(section("Lifecycle")).toHaveTextContent("Joyce");
        expect(section("Planning")).toHaveTextContent("Auditorium");
      },
    );

    // SPM-09 AC05: the three stages appear as Lifecycle, then Pre-Approved, then Planning.
    it("groups the history into Lifecycle, Pre-Approved and Planning, in that order", async () => {
      listEventStatusHistoryMock.mockResolvedValue(statusChanges);
      listClarificationsMock.mockResolvedValue([answeredClarification]);
      listEventDecisionsMock.mockResolvedValue([approval]);
      loadEventFieldHistoryMock.mockResolvedValue(planningEdits);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Planning" });
      const headings = screen
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent);
      expect(headings.slice(0, 3)).toEqual(["Lifecycle", "Pre-Approved", "Planning"]);
    });

    // SPM-09 AC05: each lifecycle entry, oldest first, with previous state, new state, actor and time.
    it("lists lifecycle entries chronologically with previous and new status, actor and time", async () => {
      listEventStatusHistoryMock.mockResolvedValue(statusChanges);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Lifecycle" });
      const entries = within(section("Lifecycle")).getAllByRole("listitem");
      expect(entries.map((entry) => entry.textContent)).toEqual([
        "draft10 Sept 2026, 4:00 pm · Jasmine",
        "draft→Pending11 Sept 2026, 4:00 pm · Jasmine",
        "Pending→planning14 Sept 2026, 8:00 pm · Joyce",
      ]);
    });

    // SPM-09 AC05: each planning entry, oldest first, with previous value, new value, actor and time.
    it("lists planning entries chronologically with previous and new value, actor and time", async () => {
      listEventDecisionsMock.mockResolvedValue([approval]);
      loadEventFieldHistoryMock.mockResolvedValue(planningEdits);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Planning" });
      const entries = within(section("Planning")).getAllByRole("listitem");
      expect(entries).toHaveLength(2);
      expect(entries[0]).toHaveTextContent(
        "Expected attendance15 Sept 2026, 9:00 am · Joyce80 → 120",
      );
      expect(entries[1]).toHaveTextContent(
        "Preferred location16 Sept 2026, 10:30 am · JasmineMain Hall → Auditorium",
      );
    });

    // SPM-09 AC05: clarification rounds, oldest first; each edit made during a round shows its
    // previous value, new value, actor and time.
    it("lists Pre-Approved rounds chronologically with each edit's values, actor and time", async () => {
      listClarificationsMock.mockResolvedValue([
        answeredClarification,
        {
          ...answeredClarification,
          id: "clarification-2",
          question: "Which room layout do you need?",
          response: "Theatre style.",
          requestedAt: "2026-09-14T10:00:00.000Z",
          respondedAt: "2026-09-14T11:00:00.000Z",
        },
      ]);
      loadEventFieldHistoryMock.mockResolvedValue([
        {
          id: 1,
          fieldName: "expectedAttendance",
          previousValue: "50",
          newValue: "80",
          changedByName: "Jasmine",
          changedAt: "2026-09-14T08:30:00.000Z",
        },
      ]);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Pre-Approved" });
      const rounds = within(section("Pre-Approved"))
        .getAllByRole("listitem")
        .filter((item) => item.parentElement?.tagName === "OL");
      expect(rounds).toHaveLength(2);
      expect(rounds[0]).toHaveTextContent("Can you confirm the headcount?");
      expect(rounds[0]).toHaveTextContent("Organiser responded 14 Sept 2026, 5:00 pm");
      expect(rounds[0]).toHaveTextContent(
        "Expected attendance: 50 → 80 · 14 Sept 2026, 4:30 pm · Jasmine",
      );
      expect(rounds[1]).toHaveTextContent("Which room layout do you need?");
      expect(rounds[1]).not.toHaveTextContent("Expected attendance");
    });
  });

  describe("SPM-12: who changed the status", () => {
    const change = {
      id: 1,
      fromStatus: "requested",
      toStatus: "planning",
      changedAt: "2026-09-14T12:00:00.000Z",
    };

    // SPM-12 AC03: the person who made a change is named.
    it("names the person who changed the status", async () => {
      listEventStatusHistoryMock.mockResolvedValue([
        { ...change, changedById: "coordinator-1", changedByName: "Joyce" },
      ]);

      renderPage();

      expect(await screen.findByText("14 Sept 2026, 8:00 pm · Joyce")).toBeInTheDocument();
    });

    // SPM-12 AC03: a change no person made is shown as a system action.
    it("shows a change with no actor as a system action", async () => {
      listEventStatusHistoryMock.mockResolvedValue([
        { ...change, changedById: null, changedByName: null },
      ]);

      renderPage();

      expect(await screen.findByText("14 Sept 2026, 8:00 pm · System")).toBeInTheDocument();
    });

    // A person whose name this viewer cannot read is not mislabelled as the system.
    it("does not call a person the system when their name is hidden", async () => {
      listEventStatusHistoryMock.mockResolvedValue([
        { ...change, changedById: "venue-staff-1", changedByName: null },
      ]);

      renderPage();

      expect(await screen.findByText("14 Sept 2026, 8:00 pm")).toBeInTheDocument();
      expect(screen.queryByText(/System/)).not.toBeInTheDocument();
    });
  });

  // SPM-10 AC04: a facility added or removed is listed like any other change.
  it("lists facility changes in the Planning section", async () => {
    listEventDecisionsMock.mockResolvedValue([
      {
        id: "decision-1",
        decision: "approved" as const,
        rationale: null,
        decidedAt: "2026-09-14T12:00:00.000Z",
        decidedByName: "Joyce",
      },
    ]);
    loadEventFieldHistoryMock.mockResolvedValue([
      {
        id: 1,
        fieldName: "venue.facilities",
        previousValue: null,
        newValue: "Gym",
        changedByName: "Joyce",
        changedAt: "2026-09-15T01:00:00.000Z",
      },
      {
        id: 2,
        fieldName: "venue.facilities",
        previousValue: "Parking",
        newValue: null,
        changedByName: "Joyce",
        changedAt: "2026-09-15T01:00:00.000Z",
      },
    ]);

    renderPage();

    const planning = (await screen.findByRole("heading", { level: 2, name: "Planning" })).closest(
      "section",
    )!;
    const entries = within(planning).getAllByRole("listitem");
    expect(entries[0]).toHaveTextContent("Required facility15 Sept 2026, 9:00 am · JoyceNot set → Gym");
    expect(entries[1]).toHaveTextContent("Required facility15 Sept 2026, 9:00 am · JoyceParking → Not set");
  });

  // The Event Coordinator Lead oversees every event, so sees its full history
  // without being its coordinator (202610160004).
  describe("for the Event Coordinator Lead", () => {
    const EVENT_ID = "c7ceb582-cb27-47df-8dea-e3a9f0c3b676";

    afterEach(() => {
      authState.profile = { full_name: "Joyce Coordinator", role: "event_coordinator" };
    });

    it("shows the history of an event assigned to another coordinator", async () => {
      authState.profile = { full_name: "Lee Lead", role: "event_coordinator_lead" };
      loadEventDetailMock.mockResolvedValue({
        assignedCoordinatorId: "20000000-0000-0000-0000-000000000099",
      });
      listEventStatusHistoryMock.mockResolvedValue([
        {
          id: 1,
          fromStatus: "requested",
          toStatus: "planning",
          changedByName: "Joyce",
          changedAt: "2026-09-14T12:00:00.000Z",
        },
      ]);

      render(
        <MemoryRouter initialEntries={[`/events/${EVENT_ID}/history`]}>
          <Routes>
            <Route path="events/:eventId/history" element={<EventHistoryPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByRole("heading", { level: 2, name: "Lifecycle" })).toBeInTheDocument();
      expect(
        screen.queryByText("This event is unavailable or you do not have access to it."),
      ).not.toBeInTheDocument();
      expect(screen.getByText("14 Sept 2026, 8:00 pm · Joyce")).toBeInTheDocument();
      expect(screen.getByRole("heading", { level: 2, name: "Equipment" })).toBeInTheDocument();
    });
  });

  // This story: the Safety Officer's history view is scoped to safety-check
  // review rounds only, not the organiser/coordinator's full history.
  describe("for the Safety Officer", () => {
    const EVENT_ID = "c7ceb582-cb27-47df-8dea-e3a9f0c3b676";

    afterEach(() => {
      authState.profile = { full_name: "Joyce Coordinator", role: "event_coordinator" };
    });

    function renderAsSafetyOfficer() {
      authState.profile = { full_name: "Sam Safety", role: "safety_officer" };
      return render(
        <MemoryRouter initialEntries={[`/events/${EVENT_ID}/history`]}>
          <Routes>
            <Route path="events/:eventId/history" element={<EventHistoryPage />} />
            <Route path="safety-checks" element={<p>SAFETY CHECKS QUEUE</p>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it("shows only the Safety check reviews section, not the organiser/coordinator's full history", async () => {
      listSafetyCheckDecisionsMock.mockResolvedValue([
        {
          id: 1,
          round: 1,
          outcome: "rejected",
          reason: "Crowd movement plan is incomplete.",
          decidedByName: "Sam Safety",
          decidedAt: "2026-10-18T16:05:00.000Z",
          flaggedBookingIds: ["booking-1"],
          flaggedRequirementIds: ["req-1"],
        },
      ]);
      listEventStatusHistoryMock.mockResolvedValue([
        {
          id: 1,
          fromStatus: "planning",
          toStatus: "pending_safety_check",
          changedByName: "Joyce",
          changedAt: "2026-10-18T15:00:00.000Z",
        },
      ]);

      renderAsSafetyOfficer();

      expect(await screen.findByText("Round 1 · Rejected")).toBeInTheDocument();
      expect(screen.queryByText("Lifecycle")).not.toBeInTheDocument();
      expect(screen.queryByText("Pre-Approved")).not.toBeInTheDocument();
      expect(screen.queryByText("Venue bookings")).not.toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Show history" })).not.toBeInTheDocument();
      // The other loaders are outside their RLS access once an event leaves
      // pending_safety_check — don't call them at all for this role.
      expect(listEventStatusHistoryMock).not.toHaveBeenCalled();
      expect(listClarificationsMock).not.toHaveBeenCalled();
      expect(listVenueBookingsForEventMock).not.toHaveBeenCalled();
    });

    it("shows an empty state when no review round has happened yet", async () => {
      renderAsSafetyOfficer();

      expect(
        await screen.findByText("No review rounds recorded yet for this event."),
      ).toBeInTheDocument();
    });

    it("links back to the safety checks queue, not the events list", async () => {
      renderAsSafetyOfficer();

      await screen.findByText("No review rounds recorded yet for this event.");
      expect(screen.getByRole("link", { name: /Back to safety checks/ })).toHaveAttribute(
        "href",
        "/safety-checks",
      );
    });
  });

  describe("equipment history", () => {
    const microphone = {
      equipmentItemId: "item-1",
      equipmentName: "Wireless microphone",
      category: "Audio",
      quantity: 2,
      requiredFrom: "2026-10-01T01:00:00Z",
      requiredUntil: "2026-10-01T06:00:00Z",
      technicalRequirements: null,
    };

    afterEach(() => {
      authState.profile = { full_name: "Joyce Coordinator", role: "event_coordinator" };
    });

    it("lists each addition, change and removal with actor and time (SPM-27 AC07)", async () => {
      loadEquipmentHistoryMock.mockResolvedValue([
        {
          id: 1,
          changeType: "added",
          previous: null,
          next: microphone,
          changedByName: "Jasmine",
          changedAt: "2026-09-20T02:00:00.000Z",
        },
        {
          id: 2,
          changeType: "changed",
          previous: microphone,
          next: { ...microphone, quantity: 3, requiredUntil: "2026-10-01T07:00:00Z" },
          changedByName: "Joyce Coordinator",
          changedAt: "2026-09-25T02:00:00.000Z",
        },
        {
          id: 3,
          changeType: "removed",
          previous: { ...microphone, quantity: 3 },
          next: null,
          changedByName: "Joyce Coordinator",
          changedAt: "2026-09-26T02:00:00.000Z",
        },
      ]);

      renderPage();

      expect(await screen.findByText("Added · Wireless microphone")).toBeInTheDocument();
      expect(screen.getByText("20 Sept 2026, 10:00 am · Jasmine")).toBeInTheDocument();
      expect(screen.getByText("Changed · Wireless microphone")).toBeInTheDocument();
      expect(screen.getByText("Quantity:")).toBeInTheDocument();
      expect(screen.getByText("Required until:")).toBeInTheDocument();
      expect(screen.queryByText("Required from:")).not.toBeInTheDocument();
      expect(screen.getByText("Removed · Wireless microphone")).toBeInTheDocument();
    });

    it("shows an empty state to the coordinator before any equipment is recorded", async () => {
      renderPage();

      expect(await screen.findByText("No equipment changes recorded yet.")).toBeInTheDocument();
    });

    it("is not shown to the organiser", async () => {
      authState.profile = { full_name: "Jasmine", role: "event_organiser" };

      renderPage();

      expect(await screen.findByText("No status changes recorded yet.")).toBeInTheDocument();
      expect(screen.queryByText("Equipment")).not.toBeInTheDocument();
    });
  });
});
