import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listClarificationsMock = vi.fn();
const loadEventFieldHistoryMock = vi.fn();
const listEventDecisionsMock = vi.fn();
const listEventStatusHistoryMock = vi.fn();
const loadEventDetailMock = vi.fn();
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
  loadEventDetailMock.mockReset().mockResolvedValue({
    assignedCoordinatorId: "20000000-0000-0000-0000-000000000002",
  });
});

describe("EventHistoryPage", () => {
  it("links back to the event detail page", async () => {
    renderPage();

    expect(await screen.findByRole("link", { name: /Back to event/ })).toHaveAttribute(
      "href",
      "/events/event-1",
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
});
