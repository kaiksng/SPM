import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SafetyCheckDecisionDialog } from "./safety-check-decision-dialog";

const onCancel = vi.fn();
const onSubmit = vi.fn();

beforeEach(() => {
  onCancel.mockReset();
  onSubmit.mockReset().mockResolvedValue(undefined);
});

function renderDialog(decision: "approved" | "changes_requested" | "rejected", flaggedCount = 0) {
  return render(<SafetyCheckDecisionDialog decision={decision} flaggedCount={flaggedCount} onCancel={onCancel} onSubmit={onSubmit} />);
}

describe("SafetyCheckDecisionDialog approving", () => {
  // SPM-90 AC04: approving moves the event to Confirmed; the note is optional.
  it("explains that the event is confirmed and the coordinator and organiser are told", () => {
    renderDialog("approved");

    expect(screen.getByRole("dialog", { name: "Approve safety arrangement" })).toBeInTheDocument();
    expect(screen.getByText(/moves straight to Confirmed/)).toBeInTheDocument();
    expect(screen.getByText(/coordinator and organiser are both notified/)).toBeInTheDocument();
    expect(screen.getByLabelText("Note (optional)")).toBeInTheDocument();
  });

  it("approves without a note", async () => {
    const user = userEvent.setup();
    renderDialog("approved");

    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(""));
  });

  it("approves with a trimmed note", async () => {
    const user = userEvent.setup();
    renderDialog("approved");

    await user.type(screen.getByLabelText("Note (optional)"), "  All exits checked ");
    await user.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("All exits checked"));
  });

  it("closes without deciding when cancelled", async () => {
    const user = userEvent.setup();
    renderDialog("approved");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows why the approval could not be submitted, with a plain message when none is given", async () => {
    const user = userEvent.setup();
    onSubmit.mockRejectedValueOnce(new Error("Only an event Pending Safety Check can be decided"));
    renderDialog("approved");

    await user.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Only an event Pending Safety Check can be decided");

    onSubmit.mockRejectedValueOnce("boom");
    await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This decision could not be submitted."));
  });
});

// SPM-89 (shares the dialog): the other two outcomes need a reason.
describe("SafetyCheckDecisionDialog other outcomes", () => {
  it.each([
    ["changes_requested", "Request changes", "Request changes"],
    ["rejected", "Reject safety arrangement", "Reject"],
  ] as const)("%s asks for a reason before it is sent", async (decision, title, button) => {
    const user = userEvent.setup();
    renderDialog(decision, 2);

    expect(screen.getByRole("dialog", { name: title })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: button }));
    expect(screen.getByRole("alert")).toHaveTextContent("Explain the reason for this decision.");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Reason"), "Exit blocked");
    await user.click(screen.getByRole("button", { name: button }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Exit blocked"));
  });

  it("counts the flagged items in the singular and the plural", () => {
    const one = renderDialog("changes_requested", 1);
    expect(screen.getByText(/1 item will be flagged Needs Review/)).toBeInTheDocument();
    one.unmount();

    renderDialog("changes_requested", 3);
    expect(screen.getByText(/3 items will be flagged Needs Review/)).toBeInTheDocument();
  });
});
