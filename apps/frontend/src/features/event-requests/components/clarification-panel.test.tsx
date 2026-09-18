import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listClarificationsMock = vi.fn();
const requestClarificationMock = vi.fn();
const resolveClarificationMock = vi.fn();
const decideEventMock = vi.fn();

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  requestClarification: (...args: unknown[]) => requestClarificationMock(...args),
  resolveClarification: (...args: unknown[]) => resolveClarificationMock(...args),
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
  resolveClarificationMock.mockReset();
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

  it("swaps to an enabled Close clarification button and disables Approve/Reject while open (unanswered)", async () => {
    listClarificationsMock.mockResolvedValue([openClarification]);

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    expect(await screen.findByRole("button", { name: "Close clarification" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Request clarification" })).not.toBeInTheDocument();
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

  it("does not offer to close a clarification when nothing is unresolved", async () => {
    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    await screen.findByRole("button", { name: "Request clarification" });
    expect(screen.queryByRole("button", { name: "Close clarification" })).not.toBeInTheDocument();
  });

  it("lets a coordinator explicitly close an open clarification", async () => {
    listClarificationsMock.mockResolvedValue([openClarification]);
    resolveClarificationMock.mockResolvedValue({
      data: { id: "clarification-1", resolvedAt: "2026-09-14T11:00:00.000Z" },
    });
    const user = userEvent.setup();

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    await user.click(await screen.findByRole("button", { name: "Close clarification" }));

    await waitFor(() =>
      expect(resolveClarificationMock).toHaveBeenCalledWith("clarification-1"),
    );
    // AC06: once closed, approval/rejection are available again, and the
    // merged button swaps back to "Request clarification".
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Approve" })).toBeEnabled(),
    );
    expect(screen.getByRole("button", { name: "Request clarification" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close clarification" })).not.toBeInTheDocument();
  });

  // Once the organiser has answered, the merged button reads "Request
  // clarification" again rather than "Close clarification" — asking again is
  // how the coordinator moves past an answered round, and it supersedes
  // (auto-resolves) the answered one server-side.
  it("lets a coordinator ask again over an answered clarification, superseding it", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);
    requestClarificationMock.mockResolvedValue({
      data: { id: "clarification-2", requestedAt: "2026-09-14T12:00:00.000Z" },
    });
    const user = userEvent.setup();

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    expect(await screen.findByText("Response: It will be 80 attendees.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close clarification" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Request clarification" }));
    await user.type(
      screen.getByLabelText("What information is needed?"),
      "Also confirm the venue.",
    );
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(requestClarificationMock).toHaveBeenCalledWith(
        "event-1",
        "Also confirm the venue.",
        [],
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // The new open round replaces the answered one as the panel's unresolved round.
    expect(
      await screen.findByText('Awaiting the organiser\'s response to: "Also confirm the venue."'),
    ).toBeInTheDocument();
    expect(screen.queryByText("Response: It will be 80 attendees.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close clarification" })).toBeEnabled();
  });

  it("shows an error and keeps the round open when closing fails", async () => {
    listClarificationsMock.mockResolvedValue([openClarification]);
    resolveClarificationMock.mockRejectedValue(new Error("This clarification is already resolved."));
    const user = userEvent.setup();

    renderPanel({ eventId: "event-1", eventStatus: "requested", role: "coordinator" });

    await user.click(await screen.findByRole("button", { name: "Close clarification" }));

    expect(
      await screen.findByText("This clarification is already resolved."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeDisabled();
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
