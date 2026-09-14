import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listClarificationsMock = vi.fn();
const requestClarificationMock = vi.fn();
const respondToClarificationMock = vi.fn();
const resolveClarificationMock = vi.fn();

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  requestClarification: (...args: unknown[]) => requestClarificationMock(...args),
  respondToClarification: (...args: unknown[]) => respondToClarificationMock(...args),
  resolveClarification: (...args: unknown[]) => resolveClarificationMock(...args),
}));

import { ClarificationPanel } from "./clarification-panel";

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
  respondToClarificationMock.mockReset();
  resolveClarificationMock.mockReset();
});

describe("ClarificationPanel", () => {
  it("renders nothing outside the Requested status", () => {
    const { container } = render(
      <ClarificationPanel eventId="event-1" eventStatus="draft" role="coordinator" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(listClarificationsMock).not.toHaveBeenCalled();
  });

  it("lets a coordinator open a request dialog and submit it", async () => {
    const user = userEvent.setup();
    requestClarificationMock.mockResolvedValue({
      data: { id: "clarification-2", requestedAt: "2026-09-14T10:00:00.000Z" },
    });

    render(<ClarificationPanel eventId="event-1" eventStatus="requested" role="coordinator" />);

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

  it("shows a Resolve action once the organiser has answered", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);
    resolveClarificationMock.mockResolvedValue({ data: { id: "clarification-1" } });
    const user = userEvent.setup();

    render(<ClarificationPanel eventId="event-1" eventStatus="requested" role="coordinator" />);

    expect(await screen.findByText("Response: It will be 80 attendees.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Resolve clarification" }));

    await waitFor(() => expect(resolveClarificationMock).toHaveBeenCalledWith("clarification-1"));
  });

  it("lets the organiser respond to an open clarification", async () => {
    listClarificationsMock.mockResolvedValue([openClarification]);
    respondToClarificationMock.mockResolvedValue({
      data: { id: "clarification-1", respondedAt: "2026-09-14T09:00:00.000Z" },
    });
    const user = userEvent.setup();

    render(<ClarificationPanel eventId="event-1" eventStatus="requested" role="organiser" />);

    expect(await screen.findByText("Awaiting Organiser")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Respond" }));
    await user.type(screen.getByLabelText("Your response"), "It will be 80 attendees.");
    await user.click(screen.getByRole("button", { name: "Submit response" }));

    await waitFor(() =>
      expect(respondToClarificationMock).toHaveBeenCalledWith(
        "clarification-1",
        "It will be 80 attendees.",
      ),
    );
  });

  it("shows a waiting message to the organiser once answered", async () => {
    listClarificationsMock.mockResolvedValue([answeredClarification]);

    render(<ClarificationPanel eventId="event-1" eventStatus="requested" role="organiser" />);

    expect(
      await screen.findByText("Waiting for the coordinator to close this clarification."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Respond" })).not.toBeInTheDocument();
  });

  it("lists resolved rounds in the history disclosure", async () => {
    listClarificationsMock.mockResolvedValue([
      {
        ...answeredClarification,
        status: "resolved" as const,
        resolvedAt: "2026-09-14T10:00:00.000Z",
      },
    ]);

    render(<ClarificationPanel eventId="event-1" eventStatus="requested" role="coordinator" />);

    expect(await screen.findByText("Clarification history (1)")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Request clarification" }),
    ).toBeInTheDocument();
  });
});
