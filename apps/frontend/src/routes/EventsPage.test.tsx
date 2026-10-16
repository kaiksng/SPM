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
const listEventDecisionsMock = vi.fn();
const loadEventFieldHistoryMock = vi.fn();
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

vi.mock("@/features/event-requests/services/decisions", () => ({
  decideEvent: vi.fn(),
  listEventDecisions: (...args: unknown[]) => listEventDecisionsMock(...args),
}));

vi.mock("@/features/event-requests/services/field-history", () => ({
  loadEventFieldHistory: (...args: unknown[]) => loadEventFieldHistoryMock(...args),
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

  // PB-03 AC04 and AC07.
  it("shows the submission time and a permitted edit action for a Requested event", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
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
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Awaiting Organiser")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing is assigned", async () => {
    listAssignedEventsMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No events assigned yet")).toBeInTheDocument();
  });
});
