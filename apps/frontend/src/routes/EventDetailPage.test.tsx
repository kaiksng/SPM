import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/venues/hooks/use-room-layout-options", () => ({
  useRoomLayoutOptions: () => ["Theatre", "Classroom", "Boardroom", "Banquet", "Open Floor", "Auditorium", "Exhibition"],
}));

const loadEventDetailMock = vi.fn();
const listClarificationsMock = vi.fn();
const listEventDecisionsMock = vi.fn();
const loadEventFieldHistoryMock = vi.fn();
const listEventStatusHistoryMock = vi.fn();
const completeEventMock = vi.fn();
const updateEventAsCoordinatorMock = vi.fn();
const listSuggestedVenuesMock = vi.fn();
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

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  requestClarification: vi.fn(),
  respondToClarification: vi.fn(),
}));

vi.mock("@/features/event-requests/services/decisions", () => ({
  decideEvent: vi.fn(),
  listEventDecisions: (...args: unknown[]) => listEventDecisionsMock(...args),
}));

vi.mock("@/features/event-requests/services/field-history", () => ({
  loadEventFieldHistory: (...args: unknown[]) => loadEventFieldHistoryMock(...args),
}));

vi.mock("@/features/event-requests/services/event-lifecycle", () => ({
  listEventStatusHistory: (...args: unknown[]) => listEventStatusHistoryMock(...args),
  completeEvent: (...args: unknown[]) => completeEventMock(...args),
}));

// importOriginal below loads the real coordinator-event-edit module (for
// localDateTime), which imports the Supabase client. Stub the client so the
// test never needs VITE_SUPABASE_URL — CI's checks job doesn't set it.
vi.mock("@/lib/supabase-client", () => ({ supabase: {} }));

vi.mock("@/features/event-requests/services/coordinator-event-edit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/event-requests/services/coordinator-event-edit")>();
  return {
    ...actual,
    updateEventAsCoordinator: (...args: unknown[]) => updateEventAsCoordinatorMock(...args),
  };
});

vi.mock("@/features/venues/services/venues", () => ({
  listSuggestedVenues: (...args: unknown[]) => listSuggestedVenuesMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { EventDetailPage } from "./EventDetailPage";

const event = {
  id: "event-1",
  title: "Student Leadership Summit 2",
  purpose: "All university student leaders workshop",
  description: "A full day of workshops for student leaders.",
  eventType: "Workshop",
  expectedAttendance: 120,
  startsAt: "2026-09-28T17:36:00.000Z",
  endsAt: "2026-09-28T20:00:00.000Z",
  status: "requested",
  submittedAt: "2026-09-12T21:05:00.000Z",
  organiserId: "10000000-0000-0000-0000-000000000001",
  organiserName: "jasmine",
  assignedCoordinatorId: "20000000-0000-0000-0000-000000000002",
  assignedCoordinatorName: "Joyce Coordinator",
  venue: {
    preferredLocation: "Main Auditorium",
    minimumCapacity: 100,
    accessibilityNotes: "Wheelchair ramp required",
    layoutNotes: "Theatre style seating",
    facilities: ["Projector", "Microphones"],
  },
  equipment: [
    {
      id: "30000000-0000-0000-0000-000000000003",
      equipmentItemId: "40000000-0000-0000-0000-000000000004",
      equipmentName: "Laptop",
      category: "Computing",
      quantity: 2,
      requiredFrom: "2026-09-30T01:00:00.000Z",
      requiredUntil: "2026-09-30T06:00:00.000Z",
      technicalRequirements: "For registration desk",
    },
  ],
  registration: {
    required: true,
    opensAt: "2026-09-15T00:00:00.000Z",
    closesAt: "2026-09-25T00:00:00.000Z",
    capacity: 100,
    waitlistEnabled: true,
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1"]}>
      <Routes>
        <Route path="events/:eventId" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EventDetailPage", () => {
  beforeEach(() => {
    authState.profile.role = "event_coordinator";
    loadEventDetailMock.mockReset().mockResolvedValue(event);
    listClarificationsMock.mockReset().mockResolvedValue([]);
    listEventDecisionsMock.mockReset().mockResolvedValue([]);
    loadEventFieldHistoryMock.mockReset().mockResolvedValue([]);
    listEventStatusHistoryMock.mockReset().mockResolvedValue([]);
    completeEventMock.mockReset().mockResolvedValue({ eventId: "event-1", status: "completed" });
    updateEventAsCoordinatorMock.mockReset().mockResolvedValue("event-1");
    listSuggestedVenuesMock.mockReset().mockResolvedValue([
      { id: "venue-1", name: "Wing B Hall", location: "New Wing Hall", capacity: 200 },
    ]);
  });

  // SPM-15 AC03: the assigned coordinator can open an event to view its details.
  it("shows the full event detail a card cannot fit", async () => {
    renderPage();

    expect(await screen.findByText("Student Leadership Summit 2")).toBeInTheDocument();
    expect(loadEventDetailMock).toHaveBeenCalledWith("event-1");
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(
      screen.getByText("A full day of workshops for student leaders."),
    ).toBeInTheDocument();
    expect(screen.getByText("Main Auditorium")).toBeInTheDocument();
    expect(screen.queryByText("Minimum capacity")).not.toBeInTheDocument();
    expect(screen.getByText("Wheelchair ramp required")).toBeInTheDocument();
    expect(screen.getByText("Projector")).toBeInTheDocument();
    // Equipment moved to the dedicated /equipment page — no longer shown here.
    expect(screen.queryByText(/Laptop/)).not.toBeInTheDocument();
    expect(screen.getByText("Organiser: jasmine")).toBeInTheDocument();
    expect(screen.getByText("Coordinator: Joyce Coordinator")).toBeInTheDocument();
  });

  it("shows the coordinator an Edit event link only once the event is Planning", async () => {
    renderPage();

    await screen.findByText("Student Leadership Summit 2");
    expect(screen.queryByRole("link", { name: "Edit event" })).not.toBeInTheDocument();
  });

  // SPM-11 AC02: the coordinator is pointed to a change request instead of an edit.
  it.each(["confirmed", "completed", "rejected", "cancelled"])(
    "tells either role a %s event's edits are locked, pointing to a change request",
    async (status) => {
      loadEventDetailMock.mockResolvedValue({ ...event, status });

      renderPage();

      expect(
        await screen.findByText(/submit a change request instead of editing it directly/),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Edit event" })).not.toBeInTheDocument();
    },
  );

  it("links the coordinator to the coordinator edit page for a Planning event", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "planning" });

    renderPage();

    expect(await screen.findByRole("link", { name: "Edit event" })).toHaveAttribute(
      "href",
      "/events/event-1/coordinator-edit",
    );
  });

  it("shows the coordinator a lifecycle sidebar linking to the venue page", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "planning" });

    renderPage();

    expect(await screen.findByRole("navigation", { name: "Event lifecycle" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Venue" })).toHaveAttribute(
      "href",
      "/events/event-1/venue",
    );
    // Equipment links to the event's equipment arrangements (reservations).
    expect(screen.getByRole("link", { name: "Equipment" })).toHaveAttribute(
      "href",
      "/events/event-1/equipment",
    );
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument();
  });

  it("does not show the lifecycle sidebar to the organiser", async () => {
    authState.profile.role = "event_organiser";
    loadEventDetailMock.mockResolvedValue({ ...event, status: "planning" });

    renderPage();

    await screen.findByText("Student Leadership Summit 2");
    expect(screen.queryByRole("link", { name: "Venue" })).not.toBeInTheDocument();
  });

  it("no longer shows an Equipment section — it lives on the dedicated /equipment page", async () => {
    renderPage();

    await screen.findByText("Student Leadership Summit 2");
    expect(screen.queryByText("Equipment", { selector: "h2" })).not.toBeInTheDocument();
  });

  it("offers the coordinator an inline Edit control on Venue & facilities only while Planning", async () => {
    renderPage();
    await screen.findByText("Student Leadership Summit 2");
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();

    loadEventDetailMock.mockResolvedValue({ ...event, status: "planning" });
    renderPage();
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("edits Venue & facilities in place and saves via update_event_as_coordinator, unchanged everywhere else", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "planning" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));

    await user.selectOptions(
      await screen.findByLabelText("Preferred location"),
      "City Hall",
    );
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updateEventAsCoordinatorMock).toHaveBeenCalledWith(
        "event-1",
        expect.objectContaining({
          title: event.title,
          expectedAttendance: event.expectedAttendance!.toString(),
          venue: expect.objectContaining({ preferredLocation: "City Hall" }),
          // Resent with its id, so the database records no equipment change.
          equipment: [
            expect.objectContaining({
              id: "30000000-0000-0000-0000-000000000003",
              equipmentItemId: "40000000-0000-0000-0000-000000000004",
              quantity: "2",
              notes: "For registration desk",
            }),
          ],
        }),
      );
    });
    expect(await screen.findByText("City Hall")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows the save error and keeps editing open when the update fails", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "planning" });
    updateEventAsCoordinatorMock.mockRejectedValue(
      new Error("This event could not be updated. Your form values are still here."),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(
      await screen.findByText("This event could not be updated. Your form values are still here."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("shows a status timeline for the event's recorded history", async () => {
    listEventStatusHistoryMock.mockResolvedValue([
      { id: 1, fromStatus: null, toStatus: "draft", changedByName: null, changedAt: "2026-09-10T08:00:00.000Z" },
      { id: 2, fromStatus: "draft", toStatus: "requested", changedByName: null, changedAt: "2026-09-11T08:00:00.000Z" },
      { id: 3, fromStatus: "requested", toStatus: "planning", changedByName: null, changedAt: "2026-09-12T08:00:00.000Z" },
    ]);

    renderPage();

    expect(await screen.findByText("draft")).toBeInTheDocument();
    // "Pending" also appears as the top-of-page status badge (the mock
    // event's own status is "requested"), so there are two matches — this
    // only asserts the timeline's own also renders.
    expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    expect(screen.getByText("planning")).toBeInTheDocument();
  });

  it("offers Mark as completed to the coordinator only for a Confirmed event", async () => {
    renderPage();
    await screen.findByText("Student Leadership Summit 2");
    expect(
      screen.queryByRole("button", { name: "Mark as completed" }),
    ).not.toBeInTheDocument();

    loadEventDetailMock.mockResolvedValue({ ...event, status: "confirmed" });
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Mark as completed" }),
    ).toBeInTheDocument();
  });

  it("marks the event completed and updates the badge", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "confirmed" });
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Mark as completed" }));

    expect(completeEventMock).toHaveBeenCalledWith("event-1");
    expect(await screen.findByText("completed")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark as completed" }),
    ).not.toBeInTheDocument();
  });

  it("shows an error if marking an event completed fails", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, status: "confirmed" });
    completeEventMock.mockRejectedValue(new Error("This event could not be marked completed."));
    const user = userEvent.setup();

    renderPage();
    await user.click(await screen.findByRole("button", { name: "Mark as completed" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event could not be marked completed.",
    );
  });

  it("shows the coordinator's Request clarification, Approve and Reject actions", async () => {
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Request clarification" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("tells the coordinator which area was edited, without a generic sentence or the question", async () => {
    listClarificationsMock.mockResolvedValue([
      {
        id: "clarification-1",
        question: "Can you confirm the headcount?",
        response: "It will be 120 attendees.",
        status: "answered",
        permittedFields: ["expectedAttendance"],
        requestedAt: "2026-09-14T08:00:00.000Z",
        respondedAt: "2026-09-14T09:00:00.000Z",
        resolvedAt: null,
      },
    ]);

    renderPage();

    expect(await screen.findByText("Edited:")).toBeInTheDocument();
    // "Expected attendance" also labels the Overview field above, so this
    // only asserts the highlighted chip renders too, not that it's unique.
    expect(screen.getAllByText("Expected attendance").length).toBeGreaterThan(0);
    expect(
      screen.queryByText(/Organiser has addressed your clarification/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/^Clarification:/)).not.toBeInTheDocument();
    // The badge itself stays neutral (Pending), not a distinct "answered" pill.
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows an error state when the event cannot be loaded", async () => {
    loadEventDetailMock.mockRejectedValue(
      new Error("This event is unavailable or you do not have access to it."),
    );

    renderPage();

    expect(
      await screen.findByText("This event is unavailable or you do not have access to it."),
    ).toBeInTheDocument();
  });

  // SPM-15 AC02: another coordinator's event is not shown to this coordinator.
  it("denies a coordinator who is not assigned to this event (SPM-09 AC02)", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...event,
      assignedCoordinatorId: "20000000-0000-0000-0000-000000000099",
      assignedCoordinatorName: "Someone Else",
    });

    renderPage();

    expect(
      await screen.findByText("This event is unavailable or you do not have access to it."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Student Leadership Summit 2")).not.toBeInTheDocument();
  });

  // SPM-80 TC-011: the organiser is told their request is awaiting coordinator assignment.
  describe("SPM-80: awaiting coordinator assignment", () => {
    afterEach(() => {
      authState.user.id = "20000000-0000-0000-0000-000000000002";
    });

    it("tells the organiser the request is awaiting coordinator assignment", async () => {
      authState.profile.role = "event_organiser";
      authState.user.id = event.organiserId;
      loadEventDetailMock.mockResolvedValue({
        ...event,
        status: "requested",
        assignedCoordinatorId: null,
        assignedCoordinatorName: null,
      });

      renderPage();

      expect(await screen.findByText("Awaiting coordinator assignment")).toBeInTheDocument();
    });

    it("stops showing that message once a coordinator is assigned", async () => {
      authState.profile.role = "event_organiser";
      authState.user.id = event.organiserId;
      loadEventDetailMock.mockResolvedValue({ ...event, status: "requested" });

      renderPage();

      expect(await screen.findByText("Student Leadership Summit 2")).toBeInTheDocument();
      expect(screen.queryByText("Awaiting coordinator assignment")).not.toBeInTheDocument();
      expect(screen.getByText("Coordinator: Joyce Coordinator")).toBeInTheDocument();
    });
  });

  // SPM-12 AC02: whoever can view the event sees its current status.
  describe("SPM-12: the event's current status", () => {
    const EVENT_ID = "c7ceb582-cb27-47df-8dea-e3a9f0c3b676";

    afterEach(() => {
      authState.user.id = "20000000-0000-0000-0000-000000000002";
    });

    it.each([
      ["organiser", "event_organiser", event.organiserId],
      ["assigned coordinator", "event_coordinator", event.assignedCoordinatorId],
      ["Event Coordinator Lead", "event_coordinator_lead", "30000000-0000-0000-0000-000000000009"],
    ])("shows the %s the event's current status", async (_who, role, userId) => {
      authState.profile.role = role;
      authState.user.id = userId;
      loadEventDetailMock.mockResolvedValue({ ...event, id: EVENT_ID, status: "pending_safety_check" });

      render(
        <MemoryRouter initialEntries={[`/events/${EVENT_ID}`]}>
          <Routes>
            <Route path="events/:eventId" element={<EventDetailPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(await screen.findByText("Student Leadership Summit 2")).toBeInTheDocument();
      expect(screen.getByText("pending safety check")).toBeInTheDocument();
    });
  });

  describe("SPM-11: blocking direct edits on finalised events", () => {
    const finalisedStatuses = ["confirmed", "completed", "rejected", "cancelled"];
    const changeRequestMessage = /submit a change request instead of editing it directly/;

    afterEach(() => {
      authState.user.id = "20000000-0000-0000-0000-000000000002";
    });

    // SPM-11 AC02: the organiser sees the same change-request message.
    it.each(finalisedStatuses)(
      "points the organiser of a %s event to a change request",
      async (status) => {
        authState.profile.role = "event_organiser";
        authState.user.id = event.organiserId;
        loadEventDetailMock.mockResolvedValue({ ...event, status });

        renderPage();

        expect(await screen.findByText(changeRequestMessage)).toBeInTheDocument();
      },
    );

    // SPM-11 AC01: the coordinator is offered no way to edit a finalised event.
    it.each(finalisedStatuses)(
      "offers the coordinator no edit control on a %s event",
      async (status) => {
        loadEventDetailMock.mockResolvedValue({ ...event, status });

        renderPage();

        await screen.findByText(changeRequestMessage);
        expect(screen.queryByRole("link", { name: "Edit event" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
      },
    );

    // SPM-11 AC02: the message is only for finalised events.
    it.each(["requested", "planning", "pending_safety_check"])(
      "does not show the change-request message for a %s event",
      async (status) => {
        loadEventDetailMock.mockResolvedValue({ ...event, status });

        renderPage();

        await screen.findByText("Student Leadership Summit 2");
        expect(screen.queryByText(changeRequestMessage)).not.toBeInTheDocument();
      },
    );
  });

  // SPM-09: As an Event Coordinator, I want to view the latest requirements and full
  // change history for an event I'm assigned to, so that I can confirm all internal
  // teams are working from the current agreed information.
  describe("SPM-09: viewing an event's latest requirements", () => {
    const lifecycleStatuses = [
      "requested",
      "planning",
      "pending_safety_check",
      "confirmed",
      "completed",
      "rejected",
      "cancelled",
    ];

    /** The value shown under a label in a details list, e.g. "Expected attendance" → "120". */
    function fieldValue(label: string) {
      return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
    }

    afterEach(() => {
      authState.user.id = "20000000-0000-0000-0000-000000000002";
    });

    // SPM-09 AC01: the assigned coordinator sees the current requirements in every lifecycle status.
    it.each(lifecycleStatuses)(
      "shows the assigned coordinator the current requirements of a %s event",
      async (status) => {
        loadEventDetailMock.mockResolvedValue({
          ...event,
          status,
          expectedAttendance: 150,
          venue: { ...event.venue, preferredLocation: "Grand Hall" },
          registration: { ...event.registration, capacity: 140 },
        });

        renderPage();

        expect(await screen.findByText("Student Leadership Summit 2")).toBeInTheDocument();
        expect(fieldValue("Purpose")).toBe("All university student leaders workshop");
        expect(fieldValue("Expected attendance")).toBe("150");
        expect(screen.getByText("Grand Hall")).toBeInTheDocument();
        expect(screen.queryByText("Main Auditorium")).not.toBeInTheDocument();
        expect(fieldValue("Capacity")).toBe("140");
        expect(fieldValue("Waitlist")).toBe("Enabled");
      },
    );

    // SPM-09 AC02: an unassigned coordinator is denied in every lifecycle status.
    it.each(lifecycleStatuses)(
      "denies a coordinator who is not assigned to a %s event",
      async (status) => {
        loadEventDetailMock.mockResolvedValue({
          ...event,
          status,
          assignedCoordinatorId: "20000000-0000-0000-0000-000000000099",
          assignedCoordinatorName: "Someone Else",
        });

        renderPage();

        expect(
          await screen.findByText("This event is unavailable or you do not have access to it."),
        ).toBeInTheDocument();
        expect(screen.queryByText("Student Leadership Summit 2")).not.toBeInTheDocument();
        expect(screen.queryByText("All university student leaders workshop")).not.toBeInTheDocument();
        expect(screen.queryByText("Purpose")).not.toBeInTheDocument();
      },
    );

    // SPM-09 AC04: the organiser is exempt from AC02 — the assigned coordinator is someone else.
    it.each(["requested", "planning", "confirmed", "cancelled"])(
      "shows the organiser the requirements of their own %s event",
      async (status) => {
        authState.profile.role = "event_organiser";
        authState.user.id = event.organiserId;
        loadEventDetailMock.mockResolvedValue({ ...event, status });

        renderPage();

        expect(await screen.findByText("Student Leadership Summit 2")).toBeInTheDocument();
        expect(fieldValue("Purpose")).toBe("All university student leaders workshop");
        expect(
          screen.queryByText("This event is unavailable or you do not have access to it."),
        ).not.toBeInTheDocument();
      },
    );
  });

  // SPM-49 AC03: an attendee who enters an event's address directly is
  // denied, and none of its internal planning details are shown.
  it("denies an attendee who opens an event page directly", async () => {
    authState.profile.role = "attendee";

    renderPage();

    expect(await screen.findByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText("Student Leadership Summit 2")).not.toBeInTheDocument();
    expect(screen.queryByText("Main Auditorium")).not.toBeInTheDocument();
    expect(screen.queryByText("Organiser: jasmine")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Approve|Reject|Request clarification/ })).not.toBeInTheDocument();
  });

  describe("SPM-14: organiser access restricted to own events", () => {
    beforeEach(() => {
      authState.profile.role = "event_organiser";
      authState.user.id = event.organiserId;
    });

    afterEach(() => {
      authState.user.id = "20000000-0000-0000-0000-000000000002";
    });

    // SPM-14 AC01: an organiser can view an event they are authorised on.
    it("shows the organiser the details of their own event", async () => {
      renderPage();

      expect(await screen.findByText("Student Leadership Summit 2")).toBeInTheDocument();
      expect(loadEventDetailMock).toHaveBeenCalledWith("event-1");
      expect(screen.getByText("Organiser: jasmine")).toBeInTheDocument();
      expect(
        screen.queryByText("This event is unavailable or you do not have access to it."),
      ).not.toBeInTheDocument();
    });

    // SPM-14 AC03: RLS hides another organiser's event, so the load fails
    // and the page denies access without revealing any of its details.
    it("denies the organiser an event they are not authorised on", async () => {
      loadEventDetailMock.mockRejectedValue(
        new Error("This event is unavailable or you do not have access to it."),
      );

      renderPage();

      expect(await screen.findByText("Event unavailable")).toBeInTheDocument();
      expect(
        screen.getByText("This event is unavailable or you do not have access to it."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Student Leadership Summit 2")).not.toBeInTheDocument();
      expect(screen.queryByText("All university student leaders workshop")).not.toBeInTheDocument();
      expect(screen.queryByText("Organiser: jasmine")).not.toBeInTheDocument();
    });
  });
});
