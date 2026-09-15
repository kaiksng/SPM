import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventFieldHistoryMock = vi.fn();

vi.mock("@/features/event-requests/services/field-history", () => ({
  loadEventFieldHistory: (...args: unknown[]) => loadEventFieldHistoryMock(...args),
}));

import { RequirementHistoryPanel } from "./requirement-history-panel";

beforeEach(() => {
  loadEventFieldHistoryMock.mockReset().mockResolvedValue([]);
});

describe("RequirementHistoryPanel", () => {
  it("renders nothing for an organiser, regardless of status", () => {
    const { container } = render(
      <RequirementHistoryPanel eventId="event-1" eventStatus="planning" role="organiser" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(loadEventFieldHistoryMock).not.toHaveBeenCalled();
  });

  it("renders nothing for a coordinator when the event is not Planning", () => {
    const { container } = render(
      <RequirementHistoryPanel eventId="event-1" eventStatus="requested" role="coordinator" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(loadEventFieldHistoryMock).not.toHaveBeenCalled();
  });

  it("loads and displays each change in sequence for a coordinator viewing a Planning event", async () => {
    loadEventFieldHistoryMock.mockResolvedValue([
      {
        id: 1,
        fieldName: "expectedAttendance",
        previousValue: "80",
        newValue: "120",
        changedByName: "Jasmine Tan",
        changedAt: "2026-09-14T08:00:00.000Z",
      },
      {
        id: 2,
        fieldName: "registration.required",
        previousValue: "false",
        newValue: "true",
        changedByName: "Jasmine Tan",
        changedAt: "2026-09-14T09:00:00.000Z",
      },
    ]);

    render(<RequirementHistoryPanel eventId="event-1" eventStatus="planning" role="coordinator" />);

    await waitFor(() => {
      expect(screen.getByText("Expected attendance")).toBeInTheDocument();
    });

    const entries = screen.getAllByRole("listitem");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("80");
    expect(entries[0]).toHaveTextContent("120");
    expect(entries[0]).toHaveTextContent("Jasmine Tan");
    expect(screen.getByText("Registration required")).toBeInTheDocument();
    expect(entries[1]).toHaveTextContent("Yes");

    expect(loadEventFieldHistoryMock).toHaveBeenCalledWith("event-1");
  });

  it("shows an empty state when a Planning event has no recorded changes", async () => {
    render(<RequirementHistoryPanel eventId="event-1" eventStatus="planning" role="coordinator" />);

    await waitFor(() => {
      expect(
        screen.getByText("No changes have been recorded for this event yet."),
      ).toBeInTheDocument();
    });
  });

  it("shows an error message when the history fails to load", async () => {
    loadEventFieldHistoryMock.mockRejectedValue(new Error("boom"));

    render(<RequirementHistoryPanel eventId="event-1" eventStatus="planning" role="coordinator" />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("boom");
    });
  });
});
