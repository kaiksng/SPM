import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WithdrawRegistrationDialog } from "./withdraw-registration-dialog";

const onCancel = vi.fn();
const onSubmit = vi.fn();

beforeEach(() => {
  onCancel.mockReset();
  onSubmit.mockReset().mockResolvedValue(undefined);
});

function renderDialog() {
  return render(
    <WithdrawRegistrationDialog eventTitle="AI Innovation Summit" onCancel={onCancel} onSubmit={onSubmit} />,
  );
}

describe("WithdrawRegistrationDialog", () => {
  // SPM-43 AC02: the attendee is told their place will be released before confirming.
  it("explains that the place will be released and they can register again", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Withdraw your registration" })).toBeInTheDocument();
    expect(
      screen.getByText(/Your place for "AI Innovation Summit" will be released/),
    ).toBeInTheDocument();
    expect(screen.getByText(/You can register again later/)).toBeInTheDocument();
  });

  // SPM-43 AC01: the withdrawal reason is optional.
  it("withdraws with no reason", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText("(optional)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(""));
  });

  // SPM-43 AC01: a given reason is sent, without surrounding spaces.
  it("withdraws with a trimmed reason", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/Reason/), "  Can no longer attend.  ");
    await user.click(screen.getByRole("button", { name: "Withdraw" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Can no longer attend."));
  });

  it("closes without withdrawing when cancelled", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // SPM-43 scenario 2: a refused withdrawal (e.g. the organiser does not permit
  // it) is shown in the dialog, and the attendee can try again.
  it("shows why a withdrawal was refused and lets the attendee try again", async () => {
    onSubmit.mockRejectedValueOnce(new Error("Withdrawal is not permitted for this event."));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Withdrawal is not permitted for this event.",
    );
    expect(screen.getByRole("button", { name: "Withdraw" })).toBeEnabled();
  });

  it("uses a plain message when the failure has none", async () => {
    onSubmit.mockRejectedValueOnce("network down");
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This registration could not be withdrawn.",
    );
  });

  it("disables Withdraw while the withdrawal is being sent", async () => {
    onSubmit.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Withdraw" }));

    expect(screen.getByRole("button", { name: "Withdraw" })).toBeDisabled();
  });
});
