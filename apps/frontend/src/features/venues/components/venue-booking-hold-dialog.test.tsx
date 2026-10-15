import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { VenueBookingHoldDialog } from "./venue-booking-hold-dialog";

const onSubmit = vi.fn<(expiresAtIso: string) => Promise<unknown>>();
const onCancel = vi.fn();

function renderDialog() {
  return render(
    <VenueBookingHoldDialog
      eventTitle="Leadership Summit"
      venueName="Innovation Hall"
      onCancel={onCancel}
      onSubmit={onSubmit}
    />,
  );
}

function setDeadline(value: string) {
  fireEvent.change(screen.getByLabelText("Expires at"), { target: { value } });
}

beforeEach(() => {
  onSubmit.mockReset().mockResolvedValue(undefined);
  onCancel.mockReset();
});

describe("VenueBookingHoldDialog", () => {
  it("names the request being put on hold", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Place this request on hold" })).toBeInTheDocument();
    expect(screen.getByText("Leadership Summit · Innovation Hall")).toBeInTheDocument();
    expect(screen.getByLabelText("Expires at")).toHaveAttribute("type", "datetime-local");
  });

  it("asks for a deadline instead of submitting an empty one", async () => {
    renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Place on hold" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Enter a date and time for the hold to expire.");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  // The input is Singapore local time; the backend needs an absolute instant.
  it.each([
    ["a morning deadline", "2026-10-20T09:00", "2026-10-20T01:00:00.000Z"],
    ["a deadline just after midnight (the previous day in UTC)", "2026-10-20T00:30", "2026-10-19T16:30:00.000Z"],
    ["a late-evening deadline", "2026-10-20T23:59", "2026-10-20T15:59:00.000Z"],
  ])("sends %s converted from Singapore time to UTC", async (_label, local, iso) => {
    renderDialog();
    setDeadline(local);

    await userEvent.click(screen.getByRole("button", { name: "Place on hold" }));

    expect(onSubmit).toHaveBeenCalledWith(iso);
  });

  it("disables the button and shows progress while the hold is being placed", async () => {
    let finish!: () => void;
    onSubmit.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderDialog();
    setDeadline("2026-10-20T09:00");

    await userEvent.click(screen.getByRole("button", { name: "Place on hold" }));

    expect(screen.getByRole("button", { name: "Placing hold…" })).toBeDisabled();
    finish();
  });

  // "In the future, before the requested period starts" is enforced by
  // place_venue_booking_hold, so its message must be shown as-is.
  it("shows the database's reason when the hold is refused, and lets the user try again", async () => {
    onSubmit.mockRejectedValueOnce(new Error("The hold must expire before the requested period starts"));
    renderDialog();
    setDeadline("2026-10-30T09:00");

    await userEvent.click(screen.getByRole("button", { name: "Place on hold" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The hold must expire before the requested period starts",
    );
    expect(screen.getByLabelText("Expires at")).toHaveValue("2026-10-30T09:00");
    const retry = screen.getByRole("button", { name: "Place on hold" });
    expect(retry).toBeEnabled();

    setDeadline("2026-10-19T09:00");
    await userEvent.click(retry);

    expect(onSubmit).toHaveBeenLastCalledWith("2026-10-19T01:00:00.000Z");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a generic message when the failure is not an Error", async () => {
    onSubmit.mockRejectedValue("boom");
    renderDialog();
    setDeadline("2026-10-20T09:00");

    await userEvent.click(screen.getByRole("button", { name: "Place on hold" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This request could not be put on hold.");
  });

  it.each([
    ["the Cancel button", () => userEvent.click(screen.getByRole("button", { name: "Cancel" }))],
    ["the Escape key", () => userEvent.keyboard("{Escape}")],
  ])("closes without submitting from %s", async (_label, close) => {
    renderDialog();
    setDeadline("2026-10-20T09:00");

    await close();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
