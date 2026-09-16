import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listClarificationsMock = vi.fn();
const requestClarificationMock = vi.fn();
const decideEventMock = vi.fn();

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  requestClarification: (...args: unknown[]) => requestClarificationMock(...args),
}));

vi.mock("@/features/event-requests/services/decisions", () => ({
  decideEvent: (...args: unknown[]) => decideEventMock(...args),
}));

import { ClarificationPanel } from "./clarification-panel";

function renderPanel(props: Parameters<typeof ClarificationPanel>[0]) {
  return render(
    <MemoryRouter>
      <ClarificationPanel {...props} />
    </MemoryRouter>,
  );
}

const openClarification = {
  id: "clarification-1",
  question: "Can you confirm the headcount?",
  response: null,
  status: "open" as const,
  permittedFields: ["expectedAttendance"],
  requestedAt: "2026-09-14T08:00:00.000Z",
  respondedAt: null,
  resolvedAt: null,
};

const answeredClarification = {
  ...openClarification,
  status: "answered" as const,
  response: "It will be 80 attendees.",
  respondedAt: "2026-09-14T09:00:00.000Z",
};

beforeEach(() => {
  listClarificationsMock.mockReset().mockResolvedValue([]);
  requestClarificationMock.mockReset();
  decideEventMock.mockReset();
});

describe("ClarificationPanel", () => {
  it("renders nothing outside the Requested status", () => {
    const { container } = renderPanel({
      eventId: "event-1",
      eventStatus: "draft",
      role: "coordinator",
    });

    expect(container).toBeEmptyDOMElement();
    expect(listClarificationsMock).not.toHaveBeenCalled();
  });

  it("reports the review state to its caller instead of rendering its own pill", async () => {
    listClarificationsMock.mockResolvedValue([openClarification]);
    const onReviewStateChange = vi.fn();

    renderPanel({
      eventId: "event-1",
      eventStatus: "requested",
      role: "coordinator",
      onReviewStateChange,
    });

    await waitFor(() => expect(onReviewStateChange).toHaveBeenLastCalledWith("open"));
    expect(screen.queryByText("Clarification Required")).not.toBeInTheDocument();
    expect(screen.queryByText("Awaiting Organiser")).not.toBeInTheDocument();
  });

  it("reports undefined when nothing is unresolved", async () => {
    const onReviewStateChange = vi.fn();

    renderPanel({
      eventId: "event-1",
      eventStatus: "requested",
      role: "coordinator",
      onReviewStateChange,
    });

    await waitFor(() => expect(onReviewStateChange).toHaveBeenLastCalledWith(undefined));
  });

  it("lets a coordinator open a request dialog and submit it", async () => {
    const user = userEvent.setup();
    requestClarificationMock.mockResolvedValue({
      data: { id: "clarification-2", requestedAt: "2026-09-14T10:00:00.000Z" },
    });

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    await user.click(await screen.findByRole("button", { name: "Request clarification" }));
    await user.type(
      screen.getByLabelText("What information is needed?"),
      "What is the exact budget?",
    );
    await user.click(screen.getByLabelText("Purpose"));
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(requestClarificationMock).toHaveBeenCalledWith(
        "event-1",
        "What is the exact budget?",
        ["purpose"],
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("always shows Request clarification, Approve and Reject to a coordinator", async () => {
    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    expect(await screen.findByRole("button", { name: "Request clarification" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("disables all three actions while a clarification is open (unanswered)", async () => {
    listClarificationsMock.mockResolvedValue([openClarification]);

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    expect(await screen.findByRole("button", { name: "Request clarification" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeDisabled();
  });

  it("re-enables all three actions once the organiser has answered", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    expect(await screen.findByText("Response: It will be 80 attendees.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request clarification" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("lets a coordinator approve with a rationale and reports the decision", async () => {
    decideEventMock.mockResolvedValue({ data: { eventId: "event-1", status: "approved" } });
    const onDecided = vi.fn();
    const user = userEvent.setup();

    renderPanel({
      eventId: "event-1",
      eventStatus: "requested",
      role: "coordinator",
      onDecided,
    });

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.type(screen.getByLabelText("Notes (optional)"), "Looks complete.");
    await user.click(screen.getByRole("button", { name: "Approve event" }));

    await waitFor(() =>
      expect(decideEventMock).toHaveBeenCalledWith("event-1", "approved", "Looks complete."),
    );
    await waitFor(() => expect(onDecided).toHaveBeenCalledWith("approved"));
  });

  // AC03: approval does not require a rationale.
  it("lets a coordinator approve without any notes", async () => {
    decideEventMock.mockResolvedValue({ data: { eventId: "event-1", status: "planning" } });
    const user = userEvent.setup();

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve event" }));

    await waitFor(() =>
      expect(decideEventMock).toHaveBeenCalledWith("event-1", "approved", ""),
    );
  });

  it("lets a coordinator reject with a reason", async () => {
    decideEventMock.mockResolvedValue({ data: { eventId: "event-1", status: "rejected" } });
    const user = userEvent.setup();

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    await user.type(screen.getByLabelText("Reason for rejecting"), "Not ready.");
    await user.click(screen.getByRole("button", { name: "Reject event" }));

    await waitFor(() =>
      expect(decideEventMock).toHaveBeenCalledWith("event-1", "rejected", "Not ready."),
    );
  });

  // AC03: rejection requires a reason.
  it("blocks rejection without a reason", async () => {
    const user = userEvent.setup();

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Reject event" }));

    expect(
      await screen.findByText("Explain the reason for rejecting this event."),
    ).toBeInTheDocument();
    expect(decideEventMock).not.toHaveBeenCalled();
  });

  it("sends the organiser straight to the edit form to respond", async () => {
    listClarificationsMock.mockResolvedValue([openClarification]);

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "organiser" });

    expect(
      await screen.findByText('Coordinator asked: "Can you confirm the headcount?"'),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Respond" })).toHaveAttribute(
      "href",
      "/events/event-1/edit",
    );
  });

  it("shows a waiting message to the organiser once answered", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "organiser" });

    expect(
      await screen.findByText("Waiting for the coordinator to review your response."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Respond" })).not.toBeInTheDocument();
  });

});
