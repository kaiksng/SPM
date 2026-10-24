import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listEventChangeRequestsMock = vi.fn();
const submitEventChangeRequestMock = vi.fn();
const decideEventChangeRequestMock = vi.fn();
const withdrawEventChangeRequestMock = vi.fn();

vi.mock("@/features/event-requests/services/change-requests", () => ({
  listEventChangeRequests: (...args: unknown[]) => listEventChangeRequestsMock(...args),
  submitEventChangeRequest: (...args: unknown[]) => submitEventChangeRequestMock(...args),
  decideEventChangeRequest: (...args: unknown[]) => decideEventChangeRequestMock(...args),
  withdrawEventChangeRequest: (...args: unknown[]) => withdrawEventChangeRequestMock(...args),
}));

import { ChangeRequestPanel } from "./change-request-panel";

function renderPanel(props: Parameters<typeof ChangeRequestPanel>[0]) {
  return render(
    <MemoryRouter>
      <ChangeRequestPanel {...props} />
    </MemoryRouter>,
  );
}

const pendingRequest = {
  id: "change-request-1",
  requestedChanges: { description: "Move the start time to 2pm" },
  reason: "Speaker rescheduled",
  status: "pending" as const,
  reviewNotes: null,
  requestedAt: "2026-09-14T08:00:00.000Z",
  reviewedAt: null,
  withdrawnAt: null,
  implementedAt: null,
};

beforeEach(() => {
  listEventChangeRequestsMock.mockReset().mockResolvedValue([]);
  submitEventChangeRequestMock.mockReset();
  decideEventChangeRequestMock.mockReset();
  withdrawEventChangeRequestMock.mockReset();
});

describe("ChangeRequestPanel", () => {
  // AC01: only these four statuses accept a change request.
  it("renders nothing outside Requested/Planning/Confirmed/Pending Safety Check", () => {
    const { container } = renderPanel({
      eventId: "event-1",
      eventStatus: "draft",
      role: "organiser",
      isEventAssigned: true,
    });

    expect(container.querySelector("h3")).toBeNull();
    expect(listEventChangeRequestsMock).not.toHaveBeenCalled();
  });

  // SPM-46 AC07: a Completed event takes no change requests, from anyone.
  it.each(["organiser", "coordinator"] as const)(
    "renders nothing for a Completed event, even to the %s",
    (role) => {
      const { container } = renderPanel({
        eventId: "event-1",
        eventStatus: "completed",
        role,
        isEventAssigned: true,
      });

      expect(container.querySelector("h3")).toBeNull();
      expect(screen.queryByRole("button", { name: "Request a change" })).not.toBeInTheDocument();
      expect(listEventChangeRequestsMock).not.toHaveBeenCalled();
    },
  );

  it.each(["requested", "planning", "confirmed", "pending_safety_check"])(
    "renders for a %s event",
    async (status) => {
      renderPanel({
        eventId: "event-1",
        eventStatus: status,
        role: "organiser",
        isEventAssigned: true,
      });

      expect(await screen.findByText("Change requests")).toBeInTheDocument();
    },
  );

  // AC03/AC05: the organiser describes the change and gives a reason.
  it("lets the organiser submit a change request", async () => {
    const user = userEvent.setup();
    submitEventChangeRequestMock.mockResolvedValue({ data: { id: "change-request-2" } });

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "organiser",
      isEventAssigned: true,
    });

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    await user.type(
      screen.getByLabelText("What change are you requesting?"),
      "Move the start time",
    );
    await user.type(screen.getByLabelText("Reason"), "Speaker rescheduled");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    await waitFor(() =>
      expect(submitEventChangeRequestMock).toHaveBeenCalledWith(
        "event-1",
        { description: "Move the start time" },
        "Speaker rescheduled",
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  // AC03: the description of the change is required.
  it("blocks submission without a description of the change", async () => {
    const user = userEvent.setup();

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "organiser",
      isEventAssigned: true,
    });

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    await user.type(screen.getByLabelText("Reason"), "Speaker rescheduled");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByText("Describe the change you are requesting.")).toBeInTheDocument();
    expect(submitEventChangeRequestMock).not.toHaveBeenCalled();
  });

  // AC03: the reason is required.
  it("blocks submission without a reason", async () => {
    const user = userEvent.setup();

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "organiser",
      isEventAssigned: true,
    });

    await user.click(await screen.findByRole("button", { name: "Request a change" }));
    await user.type(
      screen.getByLabelText("What change are you requesting?"),
      "Move the start time",
    );
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(
      await screen.findByText("Explain the reason for this change request."),
    ).toBeInTheDocument();
    expect(submitEventChangeRequestMock).not.toHaveBeenCalled();
  });

  // Not an SPM-38 criterion: one open request at a time, so there's no
  // "Request a change" while one is pending.
  it("hides the submit button while a request is already pending", async () => {
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "organiser",
      isEventAssigned: true,
    });

    expect(await screen.findByText("Your change request is pending review.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request a change" })).not.toBeInTheDocument();
  });

  // AC08: the organiser can withdraw before a decision is made.
  it("lets the organiser withdraw a pending request", async () => {
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);
    withdrawEventChangeRequestMock.mockResolvedValue({ data: "change-request-1" });
    const user = userEvent.setup();

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "organiser",
      isEventAssigned: true,
    });

    await user.click(await screen.findByRole("button", { name: "Withdraw request" }));

    await waitFor(() =>
      expect(withdrawEventChangeRequestMock).toHaveBeenCalledWith("change-request-1"),
    );
    // No request is pending anymore, so the organiser can submit a new one —
    // the full history (including this withdrawn one) now lives on the
    // Change history page instead of here.
    expect(
      await screen.findByRole("button", { name: "Request a change" }),
    ).toBeInTheDocument();
  });

  // SPM-39 AC05: approval carries implementation notes.
  it("lets an assigned coordinator approve a pending request", async () => {
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);
    decideEventChangeRequestMock.mockResolvedValue({ data: { status: "approved" } });
    const user = userEvent.setup();

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "coordinator",
      isEventAssigned: true,
    });

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.type(screen.getByLabelText("Implementation notes"), "Move to the afternoon slot");
    await user.click(screen.getByRole("button", { name: "Approve request" }));

    await waitFor(() =>
      expect(decideEventChangeRequestMock).toHaveBeenCalledWith(
        "change-request-1",
        "approved",
        "Move to the afternoon slot",
      ),
    );
  });

  // SPM-39 AC05: approval needs implementation notes.
  it("blocks approval without implementation notes", async () => {
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);
    const user = userEvent.setup();

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "coordinator",
      isEventAssigned: true,
    });

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(screen.getByRole("button", { name: "Approve request" }));

    expect(
      await screen.findByText("Add implementation notes before approving this change request."),
    ).toBeInTheDocument();
    expect(decideEventChangeRequestMock).not.toHaveBeenCalled();
  });

  // SPM-39 AC07: the assigned coordinator applies an approved request.
  it("offers the assigned coordinator Apply change on an approved request", async () => {
    listEventChangeRequestsMock.mockResolvedValue([
      { ...pendingRequest, status: "approved" as const, reviewNotes: "Move it" },
    ]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "confirmed",
      role: "coordinator",
      isEventAssigned: true,
    });

    expect(await screen.findByRole("link", { name: "Apply change" })).toHaveAttribute(
      "href",
      "/events/event-1/change-requests/change-request-1/apply",
    );
  });

  // SPM-39 AC03: a Lead approves on an unassigned event but never applies.
  it("tells a Lead to assign a coordinator instead of offering Apply change", async () => {
    listEventChangeRequestsMock.mockResolvedValue([
      { ...pendingRequest, status: "approved" as const, reviewNotes: "Move it" },
    ]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "requested",
      role: "lead",
      isEventAssigned: false,
    });

    expect(
      await screen.findByText("Approved — assign a coordinator to apply this change."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply change" })).not.toBeInTheDocument();
  });

  it("tells the organiser an approved request is waiting to be applied", async () => {
    listEventChangeRequestsMock.mockResolvedValue([
      { ...pendingRequest, status: "approved" as const, reviewNotes: "Move it" },
    ]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "organiser",
      isEventAssigned: true,
    });

    expect(
      await screen.findByText("Your change request was approved and is waiting to be applied."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Apply change" })).not.toBeInTheDocument();
  });

  // Only rejection requires a reason.
  it("blocks rejection without a reason", async () => {
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);
    const user = userEvent.setup();

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "coordinator",
      isEventAssigned: true,
    });

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    await user.click(screen.getByRole("button", { name: "Reject request" }));

    expect(
      await screen.findByText("Explain the reason for rejecting this change request."),
    ).toBeInTheDocument();
    expect(decideEventChangeRequestMock).not.toHaveBeenCalled();
  });

  // AC06: a Lead may decide only while the event has no assigned coordinator.
  it("does not offer decide actions to a Lead when the event is already assigned", async () => {
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "requested",
      role: "lead",
      isEventAssigned: true,
    });

    await screen.findByText(/review/i);
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reject" })).not.toBeInTheDocument();
  });

  it("offers decide actions to a Lead when the event has no assigned coordinator", async () => {
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "requested",
      role: "lead",
      isEventAssigned: false,
    });

    expect(await screen.findByRole("button", { name: "Approve" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Reject" })).toBeEnabled();
  });

  it("does not offer decide or withdraw actions to a coordinator who isn't deciding this event", async () => {
    // Backend enforces the real authorization; the panel still shows the
    // decide buttons to any "coordinator" role — a wrong coordinator just
    // gets the RPC's 403 back. Withdraw is organiser-only regardless.
    listEventChangeRequestsMock.mockResolvedValue([pendingRequest]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "coordinator",
      isEventAssigned: true,
    });

    await screen.findByText(/review/i);
    expect(screen.queryByRole("button", { name: "Withdraw request" })).not.toBeInTheDocument();
  });

  // AC07/outcome visibility: past decided requests no longer render inline
  // here — the organiser sees the full history (including this one) on the
  // Change history page instead. A decided request just frees up the panel
  // to offer submitting a new one.
  it("lets the organiser submit again once a past request has been decided", async () => {
    listEventChangeRequestsMock.mockResolvedValue([
      {
        ...pendingRequest,
        id: "change-request-0",
        requestedChanges: {},
        status: "rejected" as const,
        reviewNotes: "Not enough notice.",
      },
    ]);

    renderPanel({
      eventId: "event-1",
      eventStatus: "planning",
      role: "organiser",
      isEventAssigned: true,
    });

    expect(
      await screen.findByRole("button", { name: "Request a change" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Not enough notice.")).not.toBeInTheDocument();
  });
});
