import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VenueBookingDecisionDialog } from "./venue-booking-decision-dialog";

const onCancel = vi.fn();
const onSubmit = vi.fn();

beforeEach(() => {
  onCancel.mockReset();
  onSubmit.mockReset().mockResolvedValue(undefined);
});

describe("VenueBookingDecisionDialog", () => {
  // SPM-25 AC: Venue Staff can approve a request; notes are optional.
  it("approves without notes", async () => {
    const user = userEvent.setup();
    render(<VenueBookingDecisionDialog decision="approved" onCancel={onCancel} onSubmit={onSubmit} />);

    expect(screen.getByRole("dialog", { name: "Approve venue booking request" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve request" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(""));
  });

  it("approves with trimmed notes", async () => {
    const user = userEvent.setup();
    render(<VenueBookingDecisionDialog decision="approved" onCancel={onCancel} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Notes (optional)"), "  Fits the event ");
    await user.click(screen.getByRole("button", { name: "Approve request" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Fits the event"));
  });

  // SPM-25 AC: a rejection needs a reason so the coordinator can continue planning.
  it("asks for a reason before rejecting, then sends it", async () => {
    const user = userEvent.setup();
    render(<VenueBookingDecisionDialog decision="rejected" onCancel={onCancel} onSubmit={onSubmit} />);

    expect(screen.getByRole("dialog", { name: "Reject venue booking request" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject request" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Explain the reason for rejecting this venue booking request.");
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Reason for rejecting"), "Room is reserved");
    await user.click(screen.getByRole("button", { name: "Reject request" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Room is reserved"));
  });

  it("shows why a decision could not be submitted, with a plain message when none is given", async () => {
    const user = userEvent.setup();
    onSubmit.mockRejectedValueOnce(new Error("This request was already decided"));
    render(<VenueBookingDecisionDialog decision="approved" onCancel={onCancel} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Approve request" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This request was already decided");

    onSubmit.mockRejectedValueOnce("boom");
    await user.click(screen.getByRole("button", { name: "Approve request" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This decision could not be submitted."));
  });

  it("closes without deciding when cancelled", async () => {
    const user = userEvent.setup();
    render(<VenueBookingDecisionDialog decision="approved" onCancel={onCancel} onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onCancel).toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
