import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cameFromEventsList } from "@/features/event-requests/utils/events-list-navigation";

const listEventRequestsMock = vi.fn();
const deleteEventDraftMock = vi.fn();
const cancelEventRequestMock = vi.fn();
const listAssignedEventsMock = vi.fn();
const listVenueDisruptionsMock = vi.fn();
const listVenueConflictsForCoordinatorMock = vi.fn();
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

vi.mock("@/features/venues/services/event-venue-conflicts", () => ({
  listVenueConflictsForCoordinator: (...args: unknown[]) => listVenueConflictsForCoordinatorMock(...args),
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

const loadMainVenueCapacityMock = vi.fn();
vi.mock("@/features/registrations/services/registration-settings", () => ({
  loadMainVenueCapacity: (...args: unknown[]) => loadMainVenueCapacityMock(...args),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { EventsPage } from "./EventsPage";

const noRegistration = { required: false, opensAt: null, closesAt: null, capacity: null };

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
  registration: noRegistration,
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
  registration: noRegistration,
};

let lastEventsSearch = "";
function EventsLocationSpy() {
  lastEventsSearch = useLocation().search;
  return null;
}

/** Renders EventsPage with a spy that records its URL as filters/search change. */
function renderEventsPageWithLocationSpy(initialEntries: string[] = ["/events"]) {
  lastEventsSearch = "";
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route
          path="/events"
          element={
            <>
              <EventsPage />
              <EventsLocationSpy />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Configure Event Registration: a Planning event's card tells the organiser
// when registration needs their action before the safety check.
describe("EventsPage organiser registration action", () => {
  const planning = {
    ...requested,
    id: "planning-1",
    title: "Planning Event",
    status: "planning",
    registration: {
      required: true,
      opensAt: "2099-11-01T01:00:00.000Z",
      closesAt: "2099-11-30T10:00:00.000Z",
      capacity: 80,
    },
  };

  beforeEach(() => {
    authState.profile.role = "event_organiser";
    getClarificationReviewStateMock.mockReset().mockResolvedValue(undefined);
    hasPendingChangeRequestMock.mockReset().mockResolvedValue(false);
    loadMainVenueCapacityMock.mockReset().mockResolvedValue(null);
  });

  function renderList() {
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );
  }

  it("flags required registration that hasn't been set up", async () => {
    listEventRequestsMock.mockResolvedValue([
      { ...planning, registration: { ...planning.registration, opensAt: null } },
    ]);

    renderList();

    expect(await screen.findByText("Registration setup needed")).toBeInTheDocument();
    // Incomplete settings can't be over capacity, so the venue isn't fetched.
    expect(loadMainVenueCapacityMock).not.toHaveBeenCalled();
  });

  it("flags registration capacity above the approved main venue's", async () => {
    listEventRequestsMock.mockResolvedValue([planning]);
    loadMainVenueCapacityMock.mockResolvedValue(50);

    renderList();

    expect(await screen.findByText("Registration capacity too high")).toBeInTheDocument();
    expect(loadMainVenueCapacityMock).toHaveBeenCalledWith("planning-1");
  });

  it("shows nothing once registration is complete and fits the venue", async () => {
    listEventRequestsMock.mockResolvedValue([planning]);
    loadMainVenueCapacityMock.mockResolvedValue(100);

    renderList();

    await screen.findByText("Planning Event");
    await waitFor(() => expect(loadMainVenueCapacityMock).toHaveBeenCalled());
    expect(screen.queryByText("Registration setup needed")).not.toBeInTheDocument();
    expect(screen.queryByText("Registration capacity too high")).not.toBeInTheDocument();
  });

  it("shows nothing outside Planning, where the organiser can't change registration", async () => {
    listEventRequestsMock.mockResolvedValue([
      { ...planning, status: "pending_safety_check", registration: { ...planning.registration, opensAt: null } },
    ]);

    renderList();

    await screen.findByText("Planning Event");
    expect(screen.queryByText("Registration setup needed")).not.toBeInTheDocument();
  });
});

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
    // SPM-3.
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

  // SPM-74 AC03: each active filter is its own removable chip.
  it("shows a removable chip for the organiser's status filter", async () => {
    listEventRequestsMock.mockResolvedValue([draft, requested]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Shernice Test Submission");
    await user.click(screen.getByRole("radio", { name: "Pending" }));

    const chip = await screen.findByRole("button", { name: "Remove Pending filter" });
    await user.click(chip);

    expect(await screen.findByText("Kai Test Draft")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove Pending filter" }),
    ).not.toBeInTheDocument();
  });

  // SPM-74 AC05: the organiser's search term and filters persist in the URL.
  it("keeps the organiser's active filters and search in the URL", async () => {
    listEventRequestsMock.mockResolvedValue([draft, requested]);
    const user = userEvent.setup();
    renderEventsPageWithLocationSpy();

    await screen.findByText("Shernice Test Submission");
    await user.click(screen.getByRole("radio", { name: "Pending" }));
    await user.type(screen.getByPlaceholderText("Search events"), "Shernice");

    expect(lastEventsSearch).toContain("status=requested");
    expect(lastEventsSearch).toContain("q=Shernice");
  });

  // SPM-74 AC07: returning to the list (e.g. via back navigation) restores
  // the same search and filters the organiser left, instead of resetting.
  it("restores the organiser's filters and search from the URL on mount", async () => {
    listEventRequestsMock.mockResolvedValue([draft, requested]);

    render(
      <MemoryRouter initialEntries={["/events?status=requested&q=Shernice"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search events")).toHaveValue("Shernice");
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

  // SPM-3.
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

  // SPM-80: an unassigned Requested event tells the organiser it's waiting
  // on the Lead, rather than looking stuck with no explanation.
  it("tells the organiser their Requested event is awaiting coordinator assignment", async () => {
    listEventRequestsMock.mockResolvedValue([
      { ...requested, assignedCoordinatorId: null, assignedCoordinatorName: null },
    ]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Awaiting coordinator assignment")).toBeInTheDocument();
    expect(screen.queryByText(/^Coordinator:/)).not.toBeInTheDocument();
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

  // Standardised cards: like the coordinator's, a card with View details
  // reaches the change history from inside the event, not from the card.
  it.each(["planning", "confirmed", "completed", "cancelled"])(
    "leaves the change history to the event page on a %s organiser card",
    async (status) => {
      listEventRequestsMock.mockResolvedValue([
        { ...requested, id: "later-1", title: "Later Gala", status },
      ]);

      render(
        <MemoryRouter initialEntries={["/events"]}>
          <EventsPage />
        </MemoryRouter>,
      );

      expect(await screen.findByText("Later Gala")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute("href", "/events/later-1");
      expect(screen.queryByRole("link", { name: "View change history" })).not.toBeInTheDocument();
    },
  );

  // Draft and Requested cards have no View details, so the history stays on the card.
  it.each(["draft", "requested"])(
    "keeps View change history on a %s organiser card",
    async (status) => {
      listEventRequestsMock.mockResolvedValue([
        { ...requested, id: "early-1", title: "Early Gala", status },
      ]);

      render(
        <MemoryRouter initialEntries={["/events"]}>
          <EventsPage />
        </MemoryRouter>,
      );

      expect(await screen.findByText("Early Gala")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View change history" })).toHaveAttribute(
        "href",
        "/events/early-1/history",
      );
      expect(screen.queryByRole("link", { name: "View details" })).not.toBeInTheDocument();
    },
  );

  // UI: a Pending card has one main Edit request button, like the other
  // cards' View details, with the change history as a small link below it.
  it("shows a Pending card's Edit request as its main action, with the history link below", async () => {
    listEventRequestsMock.mockResolvedValue([{ ...requested, id: "pending-1", title: "Pending Gala", status: "requested" }]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    const edit = await screen.findByRole("link", { name: "Edit request" });
    expect(edit).toHaveAttribute("href", "/events/pending-1/edit");
    const history = screen.getByRole("link", { name: "View change history" });
    expect(edit.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel Pending Gala" })).toBeInTheDocument();
  });

  // Standardised cards: View details and View registrations share one row.
  it("puts View details and View registrations side by side on the organiser's card", async () => {
    listEventRequestsMock.mockResolvedValue([
      { ...requested, id: "confirmed-1", title: "Confirmed Gala", status: "confirmed" },
    ]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    const details = await screen.findByRole("link", { name: "View details" });
    const registrations = screen.getByRole("link", { name: "View registrations" });
    expect(details.parentElement).toBe(registrations.parentElement);
  });

  // SPM-11 AC01 + AC02: no edit link; a Confirmed event points to a change
  // request, the others say they can no longer be changed.
  it.each([
    ["confirmed", /submit a change request instead of editing it directly/],
    ["completed", "This event has been completed. It can no longer be changed."],
    ["rejected", "This event was rejected. It can no longer be changed."],
    ["cancelled", "This event was cancelled. It can no longer be changed."],
  ])(
    "tells the organiser a %s event can't be edited directly",
    async (status, message) => {
      listEventRequestsMock.mockResolvedValue([
        { ...requested, id: "finalised-1", title: "Finalised Gala", status },
      ]);

      render(
        <MemoryRouter initialEntries={["/events"]}>
          <EventsPage />
        </MemoryRouter>,
      );

      expect(await screen.findByText("Finalised Gala")).toBeInTheDocument();
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Edit request" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "View details" })).toHaveAttribute(
        "href",
        "/events/finalised-1",
      );
      // View Event Registration Information: only Confirmed/Completed can have registrations.
      const registrationsLink = screen.queryByRole("link", { name: "View registrations" });
      if (status === "confirmed" || status === "completed") {
        expect(registrationsLink).toHaveAttribute("href", "/events/finalised-1/registrations");
      } else {
        expect(registrationsLink).not.toBeInTheDocument();
      }
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

  // SPM-2 AC: cancelling the deletion confirmation keeps the Draft unchanged and available.
  it("keeps the Draft when the confirmation is dismissed with Escape", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await user.click(screen.getByRole("button", { name: "Delete Kai Test Draft" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete this draft?");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Kai Test Draft")).toBeInTheDocument();
    expect(deleteEventDraftMock).not.toHaveBeenCalled();
  });

  // SPM-2 AC: the Draft is only gone once it was actually deleted.
  it("keeps the Draft and says why when the deletion fails", async () => {
    deleteEventDraftMock.mockRejectedValueOnce(new Error("This draft could not be deleted."));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await user.click(screen.getByRole("button", { name: "Delete Kai Test Draft" }));
    await user.click(screen.getByRole("button", { name: "Delete draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This draft could not be deleted.");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByText("Kai Test Draft")).toBeInTheDocument();
  });

  it("uses a plain message when the deletion fails without one", async () => {
    deleteEventDraftMock.mockRejectedValueOnce("boom");
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await user.click(screen.getByRole("button", { name: "Delete Kai Test Draft" }));
    await user.click(screen.getByRole("button", { name: "Delete draft" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This draft could not be deleted.");
  });

  // SPM-2 AC: a Draft the organiser cannot read is not displayed.
  it("explains when the organiser's requests cannot be loaded", async () => {
    listEventRequestsMock.mockRejectedValueOnce(new Error("We couldn't load your event requests."));
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your event requests.");
    expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument();
  });

  it("uses a plain message when loading fails without one", async () => {
    listEventRequestsMock.mockRejectedValueOnce("boom");
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your event requests.");
  });

  it("loads nothing when no user is signed in", async () => {
    const signedIn = authState.user;
    (authState as { user: unknown }).user = null;
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument());
    expect(listEventRequestsMock).not.toHaveBeenCalled();
    (authState as { user: unknown }).user = signedIn;
  });

  // SPM-2 AC: a Draft can be saved with only the event name, and is shown as a Draft.
  it("shows a Draft saved with only a name, with no purpose yet", async () => {
    listEventRequestsMock.mockResolvedValue([{ ...draft, purpose: null }]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Kai Test Draft")).toBeInTheDocument();
    expect(screen.getByText("Purpose not added yet")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  // SPM-2: after saving, the organiser is told the Draft was saved. Loading the list rewrites the URL
  // (to keep the filters), which used to drop this notice.
  it("shows the notice passed from the editor after a save", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/events", state: { notice: "Draft saved." } }]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.");
  });

  it("keeps the confirmation open when a key other than Escape is pressed", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Kai Test Draft");
    await user.click(screen.getByRole("button", { name: "Delete Kai Test Draft" }));
    await user.keyboard("a");

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("ignores a late list or a late failure after the organiser has left the page", async () => {
    let resolveList: (items: unknown[]) => void = () => {};
    listEventRequestsMock.mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    const first = render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );
    first.unmount();
    resolveList([draft]);

    let rejectList: (reason: unknown) => void = () => {};
    listEventRequestsMock.mockReturnValueOnce(new Promise((_, reject) => { rejectList = reject; }));
    const second = render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );
    second.unmount();
    rejectList(new Error("too late"));

    await waitFor(() => expect(listEventRequestsMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Kai Test Draft")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
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
    listVenueConflictsForCoordinatorMock.mockReset().mockResolvedValue([]);
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

  // 202611010015: a booking that has to move because of a conflict is a
  // venue issue like a disruption: same badge, same table.
  const blockConflict = {
    bookingId: "booking-9", eventId: "assigned-1", eventTitle: "Shernice Test Submission", venueName: "SMU Connex",
    bookingStartsAt: "2099-04-06T02:00:00.000Z", bookingEndsAt: "2099-04-06T04:00:00.000Z",
    blockReason: "failed mic", state: "replacement_required" as const,
  };

  it("badges an event with a venue conflict as a Venue issue and lists it with the affected bookings", async () => {
    listVenueConflictsForCoordinatorMock.mockResolvedValue([blockConflict]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    const section = await screen.findByRole("region", { name: "Affected venue bookings" });
    expect(within(section).getByText("1 open")).toBeInTheDocument();
    expect(within(section).getByText('Clashes with venue block "failed mic"')).toBeInTheDocument();
    expect(within(section).getByRole("link", { name: "Find replacement" })).toHaveAttribute("href", "/events/assigned-1/venue");

    const titles = await screen.findAllByText("Shernice Test Submission");
    const card = titles.map((title) => title.closest("article")).find((article) => article !== null);
    if (!card) throw new Error("Expected the event title to be inside an <article> card.");
    expect(within(card).getByText("Venue issue")).toBeInTheDocument();
  });

  it("leaves out a conflict on an event no longer assigned to the coordinator", async () => {
    listVenueConflictsForCoordinatorMock.mockResolvedValue([{ ...blockConflict, eventId: "someone-elses" }]);
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Shernice Test Submission");
    await waitFor(() => expect(listVenueConflictsForCoordinatorMock).toHaveBeenCalled());
    expect(screen.queryByText("Venue issue")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Affected venue bookings" })).not.toBeInTheDocument();
  });

  // SPM-80 AC: the unassigned queue and oversight view are Lead-only.
  it("does not show the Lead's unassigned queue or oversight view to a coordinator", async () => {
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Shernice Test Submission");
    expect(screen.queryByText("Event Coordinator Lead workspace")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Unassigned queue/)).not.toBeInTheDocument();
    expect(listAllEventsMock).not.toHaveBeenCalled();
  });

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

    const titles = await screen.findAllByText("Shernice Test Submission");
    const card = titles.map((title) => title.closest("article")).find((article) => article !== null);
    if (!card) throw new Error("Expected the event title to be inside an <article> card.");
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
    // The card's footer links to the detail page via its own "View details" button.
    expect(await screen.findByRole("link", { name: "View details" })).toHaveAttribute(
      "href",
      "/events/assigned-1",
    );
    // View Event Registration Information: not offered while merely requested.
    expect(screen.queryByRole("link", { name: "View registrations" })).not.toBeInTheDocument();
  });

  // Loading the list rewrites the URL (to keep the filters); that must not drop the notice the previous page handed over.
  it("still shows the notice handed over by the previous page", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/events", state: { notice: "Decision recorded." } }]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Decision recorded.");
  });

  // The event page only goes back in history to the list when the list opened it.
  it("tells the event page it was opened from the Events list", async () => {
    function EventStub() {
      return <p>FROM LIST: {String(cameFromEventsList(useLocation().state))}</p>;
    }
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/events"]}>
        <Routes>
          <Route path="/events" element={<EventsPage />} />
          <Route path="/events/:eventId" element={<EventStub />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("link", { name: "View details" }));

    expect(await screen.findByText("FROM LIST: true")).toBeInTheDocument();
  });

  // View Event Registration Information: offered once registration could exist.
  it.each(["confirmed", "completed"])(
    "offers the coordinator a View registrations link on a %s event",
    async (status) => {
      listAssignedEventsMock.mockResolvedValue([{ ...assignedEvent, status }]);

      render(
        <MemoryRouter initialEntries={["/events"]}>
          <EventsPage />
        </MemoryRouter>,
      );

      expect(
        await screen.findByRole("link", { name: "View registrations" }),
      ).toHaveAttribute("href", "/events/assigned-1/registrations");
    },
  );

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

  // SPM-15 AC01: a coordinator with no assigned events sees an empty list.
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

  // SPM-74 AC05: the coordinator's active filters and search persist in the URL.
  it("keeps the coordinator's active filters and search in the URL", async () => {
    listAssignedEventsMock.mockResolvedValue([assignedEvent, planningEvent]);
    const user = userEvent.setup();
    renderEventsPageWithLocationSpy();

    await screen.findByText("Autumn Fair");
    await user.click(screen.getByRole("radio", { name: "Planning" }));
    await user.type(screen.getByPlaceholderText("Search events"), "Autumn");

    expect(lastEventsSearch).toContain("status=planning");
    expect(lastEventsSearch).toContain("q=Autumn");
  });

  // SPM-74 AC07: returning to the list restores the same search and filters
  // the coordinator left, instead of resetting.
  it("restores the coordinator's filters and search from the URL on mount", async () => {
    listAssignedEventsMock.mockResolvedValue([assignedEvent, planningEvent]);

    render(
      <MemoryRouter initialEntries={["/events?status=planning&q=Autumn"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Autumn Fair")).toBeInTheDocument();
    expect(screen.queryByText("Shernice Test Submission")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search events")).toHaveValue("Autumn");
  });

  it("puts Pending events in an 'Awaiting your decision' section above the rest", async () => {
    listAssignedEventsMock.mockResolvedValue([planningEvent, assignedEvent]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    const awaiting = (await screen.findByRole("heading", { name: /Awaiting your decision/ })).closest("section")!;
    const others = screen.getByRole("heading", { name: /Your other events/ }).closest("section")!;
    expect(within(awaiting).getByText("Shernice Test Submission")).toBeInTheDocument();
    expect(within(awaiting).queryByText("Autumn Fair")).not.toBeInTheDocument();
    expect(within(others).getByText("Autumn Fair")).toBeInTheDocument();
    expect(
      awaiting.compareDocumentPosition(others) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows no section headings when nothing is awaiting a decision", async () => {
    listAssignedEventsMock.mockResolvedValue([planningEvent]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Autumn Fair")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Awaiting your decision/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Your other events/ })).not.toBeInTheDocument();
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

  // SPM-80: an empty unassigned queue says so rather than looking blank/broken.
  it("shows 'No unassigned events' when the queue is empty", async () => {
    listAllEventsMock.mockResolvedValue([]);
    listCoordinatorsMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("No unassigned events")).toBeInTheDocument();
  });

  // SPM-80: an empty oversight list (no assigned events yet) says so too.
  it("shows 'No events assigned yet' when no event has a coordinator", async () => {
    listAllEventsMock.mockResolvedValue([]);
    listCoordinatorsMock.mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole("button", { name: /^Oversight/ }));

    expect(await screen.findByText("No events assigned yet")).toBeInTheDocument();
  });

  // SPM-80 AC: the unassigned queue lists events oldest submission first.
  it("lists unassigned events oldest submission first", async () => {
    listAllEventsMock.mockResolvedValue([
      { ...leadEvent, id: "event-newer", title: "Newer Request", submittedAt: "2026-09-12T08:00:00.000Z" },
      { ...leadEvent, id: "event-older", title: "Older Request", submittedAt: "2026-09-10T08:00:00.000Z" },
    ]);
    listCoordinatorsMock.mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    await screen.findByText("Newer Request");
    const titles = screen
      .getAllByText(/Request$/)
      .map((element) => element.textContent);
    expect(titles).toEqual(["Older Request", "Newer Request"]);
  });

  // SPM-80 AC: Oversight can be narrowed by coordinator and status together.
  it("combines the coordinator and status filters in Oversight", async () => {
    listAllEventsMock.mockResolvedValue([
      {
        ...leadEvent,
        id: "event-c1-planning",
        title: "Coordinator One Planning Event",
        status: "planning",
        assignedCoordinatorId: "coordinator-1",
        assignedCoordinatorName: "Coordinator One",
      },
      {
        ...leadEvent,
        id: "event-c1-confirmed",
        title: "Coordinator One Confirmed Event",
        status: "confirmed",
        assignedCoordinatorId: "coordinator-1",
        assignedCoordinatorName: "Coordinator One",
      },
      {
        ...leadEvent,
        id: "event-c2-planning",
        title: "Coordinator Two Planning Event",
        status: "planning",
        assignedCoordinatorId: "coordinator-2",
        assignedCoordinatorName: "Coordinator Two",
      },
    ]);
    listCoordinatorsMock.mockResolvedValue([
      { id: "coordinator-1", fullName: "Coordinator One", activeEventCount: 2 },
      { id: "coordinator-2", fullName: "Coordinator Two", activeEventCount: 1 },
    ]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: /^Oversight/ }));
    await screen.findByText("Coordinator One Planning Event");

    await user.click(screen.getByRole("combobox", { name: "Filter by coordinator" }));
    await user.click(await screen.findByRole("option", { name: "Coordinator One" }));
    await user.click(screen.getByRole("combobox", { name: "Filter by status" }));
    await user.click(await screen.findByRole("option", { name: "Planning" }));

    expect(await screen.findByText("Coordinator One Planning Event")).toBeInTheDocument();
    expect(screen.queryByText("Coordinator One Confirmed Event")).not.toBeInTheDocument();
    expect(screen.queryByText("Coordinator Two Planning Event")).not.toBeInTheDocument();
  });

  // The Lead sees every submitted event in one place, whatever its status and
  // whether it ever got a coordinator; organisers' drafts stay private.
  it("lists every submitted event under All events, including one cancelled before assignment", async () => {
    listAllEventsMock.mockResolvedValue([
      { ...leadEvent, id: "event-cancelled", title: "Cancelled Early", status: "cancelled", assignedCoordinatorId: null, assignedCoordinatorName: null },
      { ...leadEvent, id: "event-confirmed", title: "Confirmed Gala", status: "confirmed", assignedCoordinatorId: "coordinator-1", assignedCoordinatorName: "Coordinator One" },
      { ...leadEvent, id: "event-draft", title: "Private Draft", status: "draft", assignedCoordinatorId: null, assignedCoordinatorName: null },
    ]);
    listCoordinatorsMock.mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: "All events (2)" }));

    const cancelled = (await screen.findByText("Cancelled Early")).closest("article")!;
    expect(cancelled).toHaveTextContent("Coordinator: Unassigned");
    expect(screen.getByText("Confirmed Gala")).toBeInTheDocument();
    expect(screen.queryByText("Private Draft")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Cancelled" }));
    expect(screen.getByText("Cancelled Early")).toBeInTheDocument();
    expect(screen.queryByText("Confirmed Gala")).not.toBeInTheDocument();
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

  // SPM-74 AC01: the Status and date-range panel belongs to the organiser's and
  // coordinator's views. The Lead's queue and Oversight don't show it; Oversight
  // has its own coordinator and status filters (SPM-80).
  it("SPM-74 AC01: shows the Lead no date-range filter on the queue or Oversight", async () => {
    listAllEventsMock.mockResolvedValue([leadEvent]);
    listCoordinatorsMock.mockResolvedValue([]);
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Unassigned Gala")).toBeInTheDocument();
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Filter by status" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Oversight/ }));

    expect(await screen.findByRole("combobox", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by coordinator" })).toBeInTheDocument();
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
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
    // View Event Registration Information: offered to the Lead too, once Completed.
    expect(screen.getByRole("link", { name: "View registrations" })).toHaveAttribute(
      "href",
      "/events/event-done/registrations",
    );
  });
});
