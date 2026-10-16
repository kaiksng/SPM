import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listClarificationsMock = vi.fn();
const loadEventFieldHistoryMock = vi.fn();
const listEventDecisionsMock = vi.fn();
const listEventStatusHistoryMock = vi.fn();
const loadEventDetailMock = vi.fn();
const loadEquipmentHistoryMock = vi.fn();
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
  loadEventFieldHistoryMock.mockReset().mockResolvedValue([]);
  listEventDecisionsMock.mockReset().mockResolvedValue([]);
  listEventStatusHistoryMock.mockReset().mockResolvedValue([]);
  loadEquipmentHistoryMock.mockReset().mockResolvedValue([]);
  listVenueBookingsForEventMock.mockReset().mockResolvedValue([]);
  listVenueDisruptionsMock.mockReset().mockResolvedValue([]);
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
};

describe("EventHistoryPage", () => {
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
      replacesBookingId: "booking-1", replacesVenueName: "Auditorium",
    };

    it("links an approved replacement and the booking it replaced in both directions", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([original, replacement]);
      renderPage();

      expect(await screen.findByText("Replaced by the booking at Grand Hall")).toBeInTheDocument();
      expect(screen.getByText("Replacement for the disrupted booking at Auditorium")).toBeInTheDocument();
    });

    it("says a replacement was requested, not made, while it is still pending", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([
        { ...original, status: "approved" as const },
        { ...replacement, status: "pending" as const },
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

      await screen.findByText("Grand Hall");
      expect(screen.queryByText(/Replaced by the booking/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Replacement requested at/)).not.toBeInTheDocument();
      // The attempt itself is still listed with what it was for.
      expect(screen.getByText("Replacement for the disrupted booking at Auditorium")).toBeInTheDocument();
    });

    // SPM-83: the booking keeps its own status, so the disruption is shown beside it.
    it("flags a booking that is currently disrupted beside its own status", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      listVenueDisruptionsMock.mockResolvedValue([
        { eventId: "event-1", bookingId: "booking-1", state: "replacement_required" },
      ]);
      renderPage();

      expect(await screen.findByText("Confirmed Booking")).toBeInTheDocument();
      expect(screen.getByText("Disrupted")).toBeInTheDocument();
    });

    it("does not flag a booking whose disruption is resolved, or one on another event", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      listVenueDisruptionsMock.mockResolvedValue([
        { eventId: "event-1", bookingId: "booking-1", state: "resolved" },
        { eventId: "other-event", bookingId: "booking-1", state: "replacement_required" },
      ]);
      renderPage();

      await screen.findByText("Confirmed Booking");
      expect(screen.queryByText("Disrupted")).not.toBeInTheDocument();
    });

    it("still lists the bookings when the disruptions cannot be loaded", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      listVenueDisruptionsMock.mockRejectedValue(new Error("boom"));
      renderPage();

      expect(await screen.findByText("Confirmed Booking")).toBeInTheDocument();
      expect(screen.queryByText("Disrupted")).not.toBeInTheDocument();
    });

    it("shows nothing extra for an ordinary booking", async () => {
      listVenueBookingsForEventMock.mockResolvedValue([{ ...original, status: "approved" as const }]);
      renderPage();

      await screen.findByText("Auditorium");
      expect(screen.queryByText(/Replace/)).not.toBeInTheDocument();
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

    // AC02: an unassigned coordinator is denied, whatever the event's status, even
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

    // AC02 (inverse): the assigned coordinator is not denied in any status.
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

    // AC03: edits made before approval do not count as changes since approval.
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

    // AC03: the message replaces the list only while there are no planning edits.
    it("lists planning edits instead of the no-changes message once a field is edited", async () => {
      listEventDecisionsMock.mockResolvedValue([approval]);
      loadEventFieldHistoryMock.mockResolvedValue(planningEdits);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Planning" });
      expect(section("Planning")).not.toHaveTextContent("No changes have been made");
    });

    // AC03: "since approval" needs an approval — a rejection does not open the Planning stage.
    it("does not show a Planning section for a rejected event", async () => {
      listEventDecisionsMock.mockResolvedValue([
        { ...approval, decision: "rejected" as const, rationale: "Not feasible." },
      ]);

      renderPage();

      await screen.findByRole("heading", { level: 2, name: "Lifecycle" });
      expect(screen.queryByRole("heading", { level: 2, name: "Planning" })).not.toBeInTheDocument();
      expect(screen.queryByText(/No changes have been made since/)).not.toBeInTheDocument();
    });

    // AC04: the organiser is exempt from AC02 even though another coordinator is assigned.
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

    // AC05: the three stages appear as Lifecycle, then Pre-Approved, then Planning.
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

    // AC05: each lifecycle entry, oldest first, with previous state, new state, actor and time.
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

    // AC05: each planning entry, oldest first, with previous value, new value, actor and time.
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

    // AC05: clarification rounds, oldest first; each edit made during a round shows its
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

    it("lists each addition, change and removal with actor and time (AC07)", async () => {
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

    it("is not shown to the organiser (AC08)", async () => {
      authState.profile = { full_name: "Jasmine", role: "event_organiser" };

      renderPage();

      expect(await screen.findByText("No status changes recorded yet.")).toBeInTheDocument();
      expect(screen.queryByText("Equipment")).not.toBeInTheDocument();
    });
  });
});
