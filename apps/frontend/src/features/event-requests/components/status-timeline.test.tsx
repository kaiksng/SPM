import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listEventStatusHistoryMock = vi.fn();

vi.mock("@/features/event-requests/services/event-lifecycle", () => ({
  listEventStatusHistory: (...args: unknown[]) => listEventStatusHistoryMock(...args),
}));

import { EventStatusTimeline } from "./status-timeline";

beforeEach(() => {
  listEventStatusHistoryMock.mockReset().mockResolvedValue([]);
});

describe("EventStatusTimeline", () => {
  it("renders nothing for an event with fewer than two recorded statuses", async () => {
    listEventStatusHistoryMock.mockResolvedValue([
      { id: 1, fromStatus: null, toStatus: "draft", changedByName: null, changedAt: "2026-09-10T08:00:00.000Z" },
    ]);

    const { container } = render(<EventStatusTimeline eventId="event-1" />);

    await vi.waitFor(() => expect(listEventStatusHistoryMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the full sequence of statuses the event has gone through", async () => {
    listEventStatusHistoryMock.mockResolvedValue([
      { id: 1, fromStatus: null, toStatus: "draft", changedByName: null, changedAt: "2026-09-10T08:00:00.000Z" },
      { id: 2, fromStatus: "draft", toStatus: "requested", changedByName: null, changedAt: "2026-09-11T08:00:00.000Z" },
      { id: 3, fromStatus: "requested", toStatus: "planning", changedByName: null, changedAt: "2026-09-12T08:00:00.000Z" },
    ]);

    render(<EventStatusTimeline eventId="event-1" />);

    expect(await screen.findByText("draft")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.getByText("planning")).toBeInTheDocument();
  });

  // SPM-79: the revised lifecycle's Pending Safety Check and Cancelled
  // statuses render in the timeline like every other status.
  it("shows Pending Safety Check and Cancelled entries", async () => {
    listEventStatusHistoryMock.mockResolvedValue([
      { id: 1, fromStatus: "planning", toStatus: "pending_safety_check", changedByName: null, changedAt: "2026-09-10T08:00:00.000Z" },
      { id: 2, fromStatus: "pending_safety_check", toStatus: "cancelled", changedByName: null, changedAt: "2026-09-11T08:00:00.000Z" },
    ]);

    render(<EventStatusTimeline eventId="event-1" />);

    expect(await screen.findByText("pending safety check")).toBeInTheDocument();
    expect(screen.getByText("cancelled")).toBeInTheDocument();
  });

  // SPM-79: Confirmed -> Planning (a re-review) is a valid transition, and
  // the timeline keeps it in the chronological order it happened.
  it("keeps a Confirmed -> Planning re-review step in chronological order", async () => {
    listEventStatusHistoryMock.mockResolvedValue([
      { id: 1, fromStatus: "pending_safety_check", toStatus: "confirmed", changedByName: null, changedAt: "2026-09-10T08:00:00.000Z" },
      { id: 2, fromStatus: "confirmed", toStatus: "planning", changedByName: null, changedAt: "2026-09-11T08:00:00.000Z" },
      { id: 3, fromStatus: "planning", toStatus: "pending_safety_check", changedByName: null, changedAt: "2026-09-12T08:00:00.000Z" },
    ]);

    render(<EventStatusTimeline eventId="event-1" />);

    await screen.findByText("pending safety check");
    const labels = screen
      .getAllByText(/^(confirmed|planning|pending safety check)$/)
      .map((element) => element.textContent);
    expect(labels).toEqual(["confirmed", "planning", "pending safety check"]);
  });
});
