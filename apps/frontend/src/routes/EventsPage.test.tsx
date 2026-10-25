import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listEventRequestsMock = vi.fn();
const deleteEventDraftMock = vi.fn();
const cancelEventRequestMock = vi.fn();
const listAssignedEventsMock = vi.fn();
const listVenueDisruptionsMock = vi.fn();
const listClarificationsMock = vi.fn();
const getClarificationReviewStateMock = vi.fn();
const hasPendingChangeRequestMock = vi.fn();
const listEventDecisionsMock = vi.fn();
const loadEventFieldHistoryMock = vi.fn();
const listAllEventsMock = vi.fn();
const listCoordinatorsMock = vi.fn();
const assignEventCoordinatorMock = vi.fn();
const authState = {
  profile: { full_name: "Kai Test", role: "event_organiser" },
  user: { id: "10000000-0000-0000-0000-000000000001" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/event-requests/services/event-drafts", () => ({
  listEventRequests: (...args: unknown[]) => listEventRequestsMock(...args),
  deleteEventDraft: (...args: unknown[]) => deleteEventDraftMock(...args),
  cancelEventRequest: (...args: unknown[]) => cancelEventRequestMock(...args),
}));

vi.mock("@/features/event-requests/services/assigned-events", () => ({
  listAssignedEvents: (...args: unknown[]) => listAssignedEventsMock(...args),
}));

vi.mock("@/features/venues/services/venue-disruptions", () => ({
  listVenueDisruptionsForCoordinator: (...args: unknown[]) => listVenueDisruptionsMock(...args),
}));

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  getClarificationReviewState: (...args: unknown[]) => getClarificationReviewStateMock(...args),
  requestClarification: vi.fn(),
  respondToClarification: vi.fn(),
}));

vi.mock("@/features/event-requests/services/change-requests", () => ({
  hasPendingChangeRequest: (...args: unknown[]) => hasPendingChangeRequestMock(...args),
}));

vi.mock("@/features/event-requests/services/decisions", () => ({
  decideEvent: vi.fn(),
  listEventDecisions: (...args: unknown[]) => listEventDecisionsMock(...args),
}));

vi.mock("@/features/event-requests/services/field-history", () => ({
  loadEventFieldHistory: (...args: unknown[]) => loadEventFieldHistoryMock(...args),
}));

vi.mock("@/features/event-requests/services/all-events", () => ({
  listAllEvents: (...args: unknown[]) => listAllEventsMock(...args),
  listCoordinators: (...args: unknown[]) => listCoordinatorsMock(...args),
  assignEventCoordinator: (...args: unknown[]) => assignEventCoordinatorMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { EventsPage } from "./EventsPage";

const draft = {
  id: "draft-1",
  title: "Kai Test Draft",
  purpose: "Test deletion controls",
  status: "draft",
  startsAt: null,
  endsAt: null,
  updatedAt: "2026-09-12T08:00:00.000Z",
  submittedAt: null,
  assignedCoordinatorId: null,
  assignedCoordinatorName: null,
};

const requested = {
  id: "requested-1",
  title: "Shernice Test Submission",
  purpose: "Test submission controls",
  status: "requested",
  startsAt: "2026-10-01T09:00:00.000Z",
  endsAt: "2026-10-01T11:00:00.000Z",
  updatedAt: "2026-09-13T08:00:00.000Z",
  submittedAt: "2026-09-13T08:00:00.000Z",
  assignedCoordinatorId: "20000000-0000-0000-0000-000000000002",
  assignedCoordinatorName: "Joyce Coordinator",
};

describe("EventsPage draft controls", () => {
  beforeEach(() => {
    authState.profile.role = "event_organiser";
    listEventRequestsMock.mockReset().mockResolvedValue([draft]);
    deleteEventDraftMock.mockReset().mockResolvedValue(undefined);
    cancelEventRequestMock.mockReset().mockResolvedValue(undefined);
    listClarificationsMock.mockReset().mockResolvedValue([]);
    listEventDecisionsMock.mockReset().mockResolvedValue([]);
    loadEventFieldHistoryMock.mockReset().mockResolvedValue([]);
    hasPendingChangeRequestMock.mockReset().mockResolvedValue(false);
  });

  it("lists an owned Draft with its status and edit action", async () => {
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Kai Test Draft")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue editing" })).toHaveAttribute(
      "href",
      "/events/draft-1/edit",
    );
    // PB-03.
    expect(screen.getByRole("link", { name: "Submit request" })).toHaveAttribute(
      "href",
      "/events/draft-1/submit",
    );
  });

  it("filters the list by title as the organiser types in the search box", async () => {
    listEventRequestsMock.mockResolvedValue([draft, requested]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Kai Test Draft")).toBeInTheDocument();
    expect(screen.getByText("Shernice Test Submission")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search events"), "shernice");

    expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument();
    expect(screen.getByText("Shernice Test Submission")).toBeInTheDocument();
  });

  it("shows a no-results message when the search matches nothing", async () => {
    listEventRequestsMock.mockResolvedValue([draft]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await user.type(screen.getByPlaceholderText("Search events"), "no such event");

    expect(await screen.findByText("No matching events")).toBeInTheDocument();
    expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument();
  });

  async function openEventFilters(user: ReturnType<typeof userEvent.setup>) {
  }

  it("narrows the list by status", async () => {
    listEventRequestsMock.mockResolvedValue([draft, requested]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Kai Test Draft")).toBeInTheDocument();
    await openEventFilters(user);
    await user.click(screen.getByRole("radio", { name: "Pending" }));

    expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument();
    expect(screen.getByText("Shernice Test Submission")).toBeInTheDocument();
  });

  it("narrows the list by date range and combines filters with search (AND)", async () => {
    listEventRequestsMock.mockResolvedValue([draft, requested]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Shernice Test Submission");
    await openEventFilters(user);
    await user.type(screen.getByLabelText("From"), "2026-10-02");

    // requested.startsAt is 2026-10-01, before the "From" date.
    expect(screen.queryByText("Shernice Test Submission")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("From"));
    await user.type(screen.getByLabelText("From"), "2026-09-30");
    await user.type(screen.getByPlaceholderText("Search events"), "Draft");

    // The date range now matches, but the search term doesn't (AND).
    expect(screen.queryByText("Shernice Test Submission")).not.toBeInTheDocument();
    expect(await screen.findByText("No matching events")).toBeInTheDocument();
  });

  it("shows a distinct no-match state with a clear-filters action, and clears back to the full list", async () => {
    listEventRequestsMock.mockResolvedValue([draft, requested]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await openEventFilters(user);
    await user.type(screen.getByLabelText("From"), "2099-01-01");

    const noMatch = await screen.findByText("No matching events");
    expect(screen.getByText(/adjust your filters/)).toBeInTheDocument();
    await user.click(within(noMatch.closest("section")!).getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("Kai Test Draft")).toBeInTheDocument();
    expect(screen.getByText("Shernice Test Submission")).toBeInTheDocument();
  });

  // PB-03 AC04 and AC07.
  it("shows the submission time and a permitted edit action for a Requested event", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    // "Pending" also appears as an option in the new status filter's <select>.
    expect(screen.getByText("Pending", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText(/^Submitted/)).toBeInTheDocument();
    // PB-04 AC02.
    expect(screen.getByText("Coordinator: Joyce Coordinator")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit request" })).toHaveAttribute(
      "href",
      "/events/requested-1/edit",
    );
    expect(
      screen.queryByRole("button", { name: `Delete ${requested.title}` }),
    ).not.toBeInTheDocument();
    // No open clarification: no "Clarification Required" pill.
    await waitFor(() => expect(listClarificationsMock).toHaveBeenCalledWith("requested-1"));
    expect(screen.queryByText("Clarification Required")).not.toBeInTheDocument();
    // The organiser may cancel a Requested event before it's decided, same
    // as they can still edit it.
    expect(
      await screen.findByRole("button", { name: `Cancel ${requested.title}` }),
    ).toBeEnabled();
  });

  // SPM-38: the event's own status doesn't change while a change request is
  // pending, so the card needs its own visible sign one is awaiting review.
  it("shows a Change requested badge on the organiser's card when one is pending", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);
    hasPendingChangeRequestMock.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(hasPendingChangeRequestMock).toHaveBeenCalledWith("requested-1"));
    expect(await screen.findByText("Change requested")).toBeInTheDocument();
  });

  it("shows no Change requested badge when nothing is pending", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Shernice Test Submission");
    expect(screen.queryByText("Change requested")).not.toBeInTheDocument();
  });

  it("keeps the Requested event when cancellation is dismissed", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: `Cancel ${requested.title}` }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep request" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText(requested.title)).toBeInTheDocument();
    expect(cancelEventRequestMock).not.toHaveBeenCalled();
  });

  it("removes the Requested event after confirmed cancellation", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole("button", { name: `Cancel ${requested.title}` }),
    );
    await user.click(screen.getByRole("button", { name: "Cancel request" }));

    await waitFor(() => expect(cancelEventRequestMock).toHaveBeenCalledWith("requested-1"));
    await waitFor(() =>
      expect(screen.queryByText(requested.title)).not.toBeInTheDocument(),
    );
  });

  it("disables cancelling a Requested event while a clarification is unresolved", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);
    listClarificationsMock.mockResolvedValue([
      {
        id: "clarification-1",
        question: "Can you confirm the headcount?",
        response: null,
        status: "open",
        permittedFields: ["expectedAttendance"],
        requestedAt: "2026-09-14T08:00:00.000Z",
        respondedAt: null,
        resolvedAt: null,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    const cancelButton = await screen.findByRole("button", {
      name: `Cancel ${requested.title}`,
    });
    await waitFor(() => expect(cancelButton).toBeDisabled());
  });

  // SPM-11 AC01 + AC02: no edit link, and a pointer to a change request instead.
  it.each(["confirmed", "completed", "rejected", "cancelled"])(
    "directs the organiser to a change request instead of editing a %s event",
    async (status) => {
      listEventRequestsMock.mockResolvedValue([
        { ...requested, id: "finalised-1", title: "Finalised Gala", status },
      ]);

      render(
        <MemoryRouter initialEntries={["/events"]}>
          <EventsPage />
        </MemoryRouter>,
      );

      expect(await screen.findByText("Finalised Gala")).toBeInTheDocument();
      expect(
        screen.getByText(
          "This event is finalised. Direct edits are locked — submit a change request instead.",
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Edit request" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        "/events/finalised-1",
      );
    },
  );

  it("shows the coordinator's question and a Respond action while a clarification is open", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);
    listClarificationsMock.mockResolvedValue([
      {
        id: "clarification-1",
        question: "Can you confirm the headcount?",
        response: null,
        status: "open",
        permittedFields: ["expectedAttendance"],
        requestedAt: "2026-09-14T08:00:00.000Z",
        respondedAt: null,
        resolvedAt: null,
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Clarification Required")).toBeInTheDocument();
    expect(
      screen.getByText('Coordinator asked: "Can you confirm the headcount?"'),
    ).toBeInTheDocument();
    // Responding means editing directly — no separate typed-response dialog.
    expect(screen.getByRole("link", { name: "Respond" })).toHaveAttribute(
      "href",
      "/events/requested-1/edit",
    );
  });

  it("keeps the Draft when deletion is cancelled", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await user.click(screen.getByRole("button", { name: "Delete Kai Test Draft" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep draft" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Kai Test Draft")).toBeInTheDocument();
    expect(deleteEventDraftMock).not.toHaveBeenCalled();
  });

  it("removes the Draft after confirmed deletion", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await user.click(screen.getByRole("button", { name: "Delete Kai Test Draft" }));
    await user.click(screen.getByRole("button", { name: "Delete draft" }));

    await waitFor(() => expect(deleteEventDraftMock).toHaveBeenCalledWith("draft-1"));
    await waitFor(() =>
      expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument(),
    );
  });
});

const assignedEvent = {
  id: "assigned-1",
  title: "Shernice Test Submission",
  purpose: "Test submission controls",
  status: "requested",
  startsAt: "2026-10-01T09:00:00.000Z",
  endsAt: "2026-10-01T11:00:00.000Z",
  updatedAt: "2026-09-13T08:00:00.000Z",
  submittedAt: "2026-09-13T08:00:00.000Z",
  organiserName: "Kai Test",
};

describe("EventsPage coordinator view", () => {
  beforeEach(() => {
    authState.profile.role = "event_coordinator";
    listAssignedEventsMock.mockReset().mockResolvedValue([assignedEvent]);
    listVenueDisruptionsMock.mockReset().mockResolvedValue([]);
    getClarificationReviewStateMock.mockReset().mockResolvedValue(undefined);
    hasPendingChangeRequestMock.mockReset().mockResolvedValue(false);
  });

  afterEach(() => {
    authState.profile.role = "event_organiser";
  });

  const disruption = {
    id: "disruption-1",
    bookingId: "booking-1",
    eventId: "assigned-1",
    eventTitle: "Shernice Test Submission",
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

  // SPM-83 AC: coordinators see their events with affected venue bookings in a
  // table below the event cards, and the affected event's own card carries a badge.
  it("shows open venue disruptions in a table below the events and badges the affected event", async () => {
    listVenueDisruptionsMock.mockResolvedValue([disruption]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    const section = await screen.findByRole("region", { name: "Affected venue bookings" });
    expect(within(section).getByText("1 open")).toBeInTheDocument();
    expect(within(section).getByText("Replacement Required")).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Shernice Test Submission" })).toHaveAttribute(
      "href",
      "/events/assigned-1/venue",
    );

    const card = await screen.findByRole("link", { name: /Shernice Test Submission.*Organiser/s });
    expect(within(card).getByText("Venue issue")).toBeInTheDocument();
    // The table sits after the event cards, not above them.
    expect(card.compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // SPM-38: same badge, on the coordinator's card.
  it("shows a Change requested badge on the coordinator's card when one is pending", async () => {
    hasPendingChangeRequestMock.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(hasPendingChangeRequestMock).toHaveBeenCalledWith("assigned-1"));
    expect(await screen.findByText("Change requested")).toBeInTheDocument();
  });

  it("does not badge an event whose disruption is resolved", async () => {
    listVenueDisruptionsMock.mockResolvedValue([
      { ...disruption, state: "resolved", clearedAt: new Date().toISOString() },
    ]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByRole("button", { name: "Show resolved (1)" });
    expect(screen.queryByText("Venue issue")).not.toBeInTheDocument();
  });

  it("shows no affected-bookings section when no venue booking is disrupted", async () => {
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Shernice Test Submission");
    expect(screen.queryByRole("region", { name: "Affected venue bookings" })).not.toBeInTheDocument();
  });

  it("explains when the affected bookings could not be loaded", async () => {
    listVenueDisruptionsMock.mockRejectedValue(new Error("We couldn't load your affected venue bookings."));
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("We couldn't load your affected venue bookings.")).toBeInTheDocument();
    expect(screen.getByText("Shernice Test Submission")).toBeInTheDocument();
  });

  // SPM-15 AC01: the coordinator sees the events assigned to them.
  // SPM-15 AC03: each card opens the event's detail page.
  it("lists an event assigned to the signed-in coordinator", async () => {
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    expect(screen.getByText("Organiser: Kai Test")).toBeInTheDocument();
    expect(listAssignedEventsMock).toHaveBeenCalledWith(authState.user.id);
    // The card links to the detail page rather than hosting actions itself.
    expect(screen.getByRole("link", { name: /Shernice Test Submission/ })).toHaveAttribute(
      "href",
      "/events/assigned-1",
    );
    expect(await screen.findByText("View details")).toBeInTheDocument();
  });

  it("shows the Awaiting Organiser badge while a clarification is open", async () => {
    getClarificationReviewStateMock.mockResolvedValue({
      status: "open",
      permittedFields: ["expectedAttendance"],
    });

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Awaiting Organiser")).toBeInTheDocument();
  });

  it("names the edited area, not a generic sentence, once the organiser has answered", async () => {
    getClarificationReviewStateMock.mockResolvedValue({
      status: "answered",
      permittedFields: ["expectedAttendance"],
    });

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    // "Pending" also renders on the very first tick before the async review-
    // state fetch resolves, so wait on "Edited:" (which only appears once
    // that fetch settles as "answered") rather than on the badge text.
    expect(await screen.findByText("Edited:")).toBeInTheDocument();
    expect(screen.getByText("Expected attendance")).toBeInTheDocument();
    expect(
      screen.queryByText(/Organiser has addressed the clarification/),
    ).not.toBeInTheDocument();
    // "Pending" also appears as an option in the new status filter's <select>.
    expect(screen.getByText("Pending", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("Awaiting Organiser")).not.toBeInTheDocument();
  });

  // SPM-15 AC04: a coordinator with no assigned events sees an empty list.
  it("shows an empty state when nothing is assigned", async () => {
    listAssignedEventsMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No events assigned yet")).toBeInTheDocument();
  });

  const planningEvent = {
    ...assignedEvent,
    id: "assigned-2",
    title: "Autumn Fair",
    status: "planning",
    startsAt: "2026-11-05T09:00:00.000Z",
    endsAt: "2026-11-05T11:00:00.000Z",
  };

  it("narrows the assigned events list by status and date range, AND with search", async () => {
    listAssignedEventsMock.mockResolvedValue([assignedEvent, planningEvent]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Autumn Fair")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Planning" }));

    expect(screen.queryByText("Shernice Test Submission")).not.toBeInTheDocument();
    expect(screen.getByText("Autumn Fair")).toBeInTheDocument();

    await user.type(screen.getByLabelText("From"), "2026-11-06");
    expect(await screen.findByText("No matching events")).toBeInTheDocument();
  });

  it("shows a clear-filters action on zero matches and restores the list", async () => {
    listAssignedEventsMock.mockResolvedValue([assignedEvent, planningEvent]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Shernice Test Submission");
    await user.click(screen.getByRole("radio", { name: "Planning" }));
    await user.type(screen.getByLabelText("From"), "2026-11-06");

    const noMatch = await screen.findByText("No matching events");
    await user.click(within(noMatch.closest("section")!).getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    expect(screen.getByText("Autumn Fair")).toBeInTheDocument();
  });

  it("shows a removable chip for the active status filter", async () => {
    listAssignedEventsMock.mockResolvedValue([assignedEvent, planningEvent]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Autumn Fair");
    await user.click(screen.getByRole("radio", { name: "Planning" }));

    const chip = await screen.findByRole("button", { name: "Remove Planning filter" });
    await user.click(chip);

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Planning filter" })).not.toBeInTheDocument();
  });
});

describe("EventsPage for the Event Coordinator Lead role", () => {
  beforeEach(() => {
    authState.profile.role = "event_coordinator_lead";
    listAllEventsMock.mockReset();
    listCoordinatorsMock.mockReset();
    assignEventCoordinatorMock.mockReset().mockResolvedValue(undefined);
    hasPendingChangeRequestMock.mockReset().mockResolvedValue(false);
  });

  // SPM-80 TC-014: a coordinator with no active events still appears in
  // Oversight, with a count of 0, instead of being omitted.
  it("shows a coordinator with zero active events with a count of 0", async () => {
    listAllEventsMock.mockResolvedValue([
      {
        id: "event-c1",
        title: "C1's event",
        purpose: null,
        status: "planning",
        startsAt: null,
        endsAt: null,
        updatedAt: "2026-09-12T08:00:00.000Z",
        submittedAt: "2026-09-10T08:00:00.000Z",
        expectedAttendance: null,
        organiserName: "Olivia Organiser",
        assignedCoordinatorId: "coordinator-1",
        assignedCoordinatorName: "Coordinator One",
      },
    ]);
    listCoordinatorsMock.mockResolvedValue([
      { id: "coordinator-1", fullName: "Coordinator One", activeEventCount: 1 },
      { id: "coordinator-3", fullName: "Coordinator Three", activeEventCount: 0 },
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /^Oversight/ }));

    expect(await screen.findByText("Coordinator One")).toBeInTheDocument();
    expect(screen.getByText("Coordinator Three")).toBeInTheDocument();
    expect(
      screen.getByText("Coordinator Three").closest("section"),
    ).toHaveTextContent("0 events");
  });

  const leadEvent = {
    id: "event-q1",
    title: "Unassigned Gala",
    purpose: null,
    status: "requested",
    startsAt: null,
    endsAt: null,
    updatedAt: "2026-09-12T08:00:00.000Z",
    submittedAt: "2026-09-10T08:00:00.000Z",
    expectedAttendance: null,
    organiserName: "Olivia Organiser",
    assignedCoordinatorId: null,
    assignedCoordinatorName: null,
  };

  // SPM-77 AC01 + AC02: the Lead lands on their own workspace and sees
  // unassigned events with the assignment action their role permits.
  it("shows the lead's own workspace with unassigned events to assign", async () => {
    listAllEventsMock.mockResolvedValue([leadEvent]);
    listCoordinatorsMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Event Coordinator Lead workspace")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "All events" })).toBeInTheDocument();
    expect(await screen.findByText("Unassigned Gala")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign coordinator" })).toBeInTheDocument();
    expect(listAllEventsMock).toHaveBeenCalled();
    // Not the organiser's or coordinator's own-events view.
    expect(listEventRequestsMock).not.toHaveBeenCalled();
    expect(listAssignedEventsMock).not.toHaveBeenCalled();
  });

  // SPM-38: same badge, on the Lead's queue card — relevant here since an
  // unassigned Requested event is the one case the Lead decides directly.
  it("shows a Change requested badge on the Lead's card when one is pending", async () => {
    listAllEventsMock.mockResolvedValue([leadEvent]);
    listCoordinatorsMock.mockResolvedValue([]);
    hasPendingChangeRequestMock.mockResolvedValue(true);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(hasPendingChangeRequestMock).toHaveBeenCalledWith("event-q1"));
    expect(await screen.findByText("Change requested")).toBeInTheDocument();
  });

  // SPM-77 AC02: the Lead sees every coordinator's assigned events and can reassign.
  it("shows the lead each coordinator's assigned events with a reassign action", async () => {
    listAllEventsMock.mockResolvedValue([
      {
        ...leadEvent,
        id: "event-a1",
        title: "Assigned Summit",
        status: "planning",
        assignedCoordinatorId: "coordinator-1",
        assignedCoordinatorName: "Coordinator One",
      },
    ]);
    listCoordinatorsMock.mockResolvedValue([
      { id: "coordinator-1", fullName: "Coordinator One", activeEventCount: 1 },
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: /^Oversight/ }));

    const card = (await screen.findByText("Assigned Summit")).closest("section")!;
    expect(card).toHaveTextContent("Coordinator One");
    expect(screen.getByRole("button", { name: "Reassign" })).toBeInTheDocument();
  });

  // SPM-46 AC07: a Completed event's coordinator can no longer be reassigned.
  it("offers the lead no reassign action on a Completed event", async () => {
    listAllEventsMock.mockResolvedValue([
      {
        ...leadEvent,
        id: "event-done",
        title: "Finished Summit",
        status: "completed",
        assignedCoordinatorId: "coordinator-1",
        assignedCoordinatorName: "Coordinator One",
      },
    ]);
    listCoordinatorsMock.mockResolvedValue([
      { id: "coordinator-1", fullName: "Coordinator One", activeEventCount: 0 },
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: /^Oversight/ }));
    // Oversight shows active events by default; a Completed one needs the filter.
    await user.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await user.click(await screen.findByRole("option", { name: "Completed" }));

    expect(await screen.findByText("Finished Summit")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reassign" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Assign coordinator" })).not.toBeInTheDocument();
  });
});
