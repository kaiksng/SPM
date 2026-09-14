import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listEventRequestsMock = vi.fn();
const deleteEventDraftMock = vi.fn();
const listAssignedEventsMock = vi.fn();
const listClarificationsMock = vi.fn();
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
}));

vi.mock("@/features/event-requests/services/assigned-events", () => ({
  listAssignedEvents: (...args: unknown[]) => listAssignedEventsMock(...args),
}));

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  requestClarification: vi.fn(),
  respondToClarification: vi.fn(),
  resolveClarification: vi.fn(),
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
    listClarificationsMock.mockReset().mockResolvedValue([]);
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

  // PB-03 AC04 and AC07.
  it("shows the submission time and a permitted edit action for a Requested event", async () => {
    listEventRequestsMock.mockResolvedValue([requested]);

    render(
      <MemoryRouter initialEntries={["/events"]}>
        <EventsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Shernice Test Submission")).toBeInTheDocument();
    expect(screen.getByText("requested")).toBeInTheDocument();
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
    // No open clarification: no "Awaiting Organiser" pill.
    await waitFor(() => expect(listClarificationsMock).toHaveBeenCalledWith("requested-1"));
    expect(screen.queryByText("Awaiting Organiser")).not.toBeInTheDocument();
  });

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

    expect(await screen.findByText("Awaiting Organiser")).toBeInTheDocument();
    expect(
      screen.getByText('Coordinator asked: "Can you confirm the headcount?"'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Respond" })).toBeInTheDocument();
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
    listClarificationsMock.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    authState.profile.role = "event_organiser";
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
    expect(
      await screen.findByRole("button", { name: "Request clarification" }),
    ).toBeInTheDocument();
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
