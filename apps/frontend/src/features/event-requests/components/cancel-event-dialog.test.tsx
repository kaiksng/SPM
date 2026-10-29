import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CancelEventDialog } from "./cancel-event-dialog";

describe("CancelEventDialog", () => {
  // SPM-45 AC3: a reason is always required.
  it("blocks submission and shows an error when the reason is blank", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CancelEventDialog onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Give a reason for cancelling this event.",
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("blocks submission when the reason is only whitespace", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<CancelEventDialog onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Reason for cancelling"), "   ");
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the trimmed reason", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CancelEventDialog onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(
      screen.getByLabelText("Reason for cancelling"),
      "  The venue is no longer available.  ",
    );
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    expect(onSubmit).toHaveBeenCalledWith("The venue is no longer available.");
  });

  it("disables the submit button while submitting", async () => {
    let resolveSubmit!: () => void;
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<CancelEventDialog onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Reason for cancelling"), "Too few registrations.");
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("button", { name: "Cancelling…" })).toBeDisabled();
    resolveSubmit();
  });

  it("shows the error message when submission fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("This event cannot be cancelled."));
    const user = userEvent.setup();
    render(<CancelEventDialog onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Reason for cancelling"), "Too few registrations.");
    await user.click(screen.getByRole("button", { name: "Confirm cancellation" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event cannot be cancelled.",
    );
  });

  it("keeps the event and does not submit when 'Keep event' is clicked", async () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<CancelEventDialog onCancel={onCancel} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Keep event" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
