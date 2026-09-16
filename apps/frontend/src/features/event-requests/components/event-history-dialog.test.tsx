import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listClarificationsMock = vi.fn();
const loadEventFieldHistoryMock = vi.fn();
const listEventDecisionsMock = vi.fn();

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
}));

vi.mock("@/features/event-requests/services/field-history", () => ({
  loadEventFieldHistory: (...args: unknown[]) => loadEventFieldHistoryMock(...args),
}));

vi.mock("@/features/event-requests/services/decisions", () => ({
  listEventDecisions: (...args: unknown[]) => listEventDecisionsMock(...args),
}));

import { EventHistoryButton } from "./event-history-dialog";

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

beforeEach(() => {
  listClarificationsMock.mockReset().mockResolvedValue([]);
  loadEventFieldHistoryMock.mockReset().mockResolvedValue([]);
  listEventDecisionsMock.mockReset().mockResolvedValue([]);
});

describe("EventHistoryButton", () => {
  it("renders nothing when there is no clarification or field history", async () => {
    const { container } = render(<EventHistoryButton eventId="event-1" />);

    await vi.waitFor(() => expect(listClarificationsMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the history hidden until the button is clicked", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);

    render(<EventHistoryButton eventId="event-1" />);

    await screen.findByRole("button", { name: "View change history" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the Pre-Approved section with clarification rounds", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);
    const user = userEvent.setup();

    render(<EventHistoryButton eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: "View change history" }));

    expect(screen.getByText("Pre-Approved")).toBeInTheDocument();
    expect(
      screen.getByText('Coordinator requested 14 Sept 2026, 4:00 pm: "Can you confirm the headcount?"'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Organiser responded/)).toBeInTheDocument();
    expect(screen.queryByText("Planning")).not.toBeInTheDocument();
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
    const user = userEvent.setup();

    render(<EventHistoryButton eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: "View change history" }));

    const editBlock = screen.getByText("Organiser has edited these field(s):").closest("div");
    expect(editBlock?.textContent).toContain("Expected attendance:");
    expect(editBlock?.textContent).toContain("50");
    expect(editBlock?.textContent).toContain("80");
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
    const user = userEvent.setup();

    render(<EventHistoryButton eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: "View change history" }));

    const editBlocks = screen
      .getAllByText("Organiser has edited these field(s):")
      .map((node) => node.closest("div"));
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
    const user = userEvent.setup();

    render(<EventHistoryButton eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: "View change history" }));

    expect(screen.getByText(/Coordinator resolved/)).toBeInTheDocument();
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
    const user = userEvent.setup();

    render(<EventHistoryButton eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: "View change history" }));

    expect(screen.getByText("Planning")).toBeInTheDocument();
    const preApproved = screen.getByText("Pre-Approved").closest("section");
    const planning = screen.getByText("Planning").closest("section");
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
    const user = userEvent.setup();

    render(<EventHistoryButton eventId="event-1" />);

    await user.click(await screen.findByRole("button", { name: "View change history" }));

    expect(screen.getByText("Planning")).toBeInTheDocument();
    expect(
      screen.getByText("No changes have been made since this event was approved."),
    ).toBeInTheDocument();
  });
});
