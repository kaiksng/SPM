import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssignCoordinatorDialog } from "./assign-coordinator-dialog";

const coordinators = [
  { id: "coord-1", fullName: "Priya Shah", activeEventCount: 2 },
  { id: "coord-2", fullName: "Marcus Lee", activeEventCount: 0 },
];

function renderDialog(props: Partial<Parameters<typeof AssignCoordinatorDialog>[0]> = {}) {
  const onCancel = vi.fn();
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <AssignCoordinatorDialog
      mode="assign"
      coordinators={coordinators}
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onCancel, onSubmit };
}

async function chooseCoordinator(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole("combobox", { name: "Coordinator" }));
  await user.click(await screen.findByRole("option", { name }));
}

describe("AssignCoordinatorDialog", () => {
  // SPM-81 AC08: each coordinator option shows their current number of active events.
  it("shows each coordinator's active event count next to their name", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("combobox", { name: "Coordinator" }));

    const priya = await screen.findByRole("option", { name: "Priya Shah 2 active" });
    const marcus = screen.getByRole("option", { name: "Marcus Lee 0 active" });

    // The count is pushed to the right of the name, not just appended after it.
    expect(priya.querySelector(".justify-between")).not.toBeNull();
    expect(marcus.querySelector(".justify-between")).not.toBeNull();
  });

  it("names a coordinator who has no saved name", async () => {
    const user = userEvent.setup();
    renderDialog({ coordinators: [{ id: "coord-3", fullName: null, activeEventCount: 1 }] });

    await user.click(screen.getByRole("combobox", { name: "Coordinator" }));

    expect(await screen.findByRole("option", { name: "Unnamed coordinator 1 active" })).toBeInTheDocument();
  });

  describe("assigning (SPM-81)", () => {
    // SPM-81 AC01: the Lead assigns exactly one coordinator; no reason is needed.
    it("SPM-81 AC01: assigns the chosen coordinator without needing a reason", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderDialog();

      expect(screen.getByRole("heading", { name: "Assign a coordinator" })).toBeInTheDocument();
      expect(screen.getByLabelText("Reason (optional)")).toBeInTheDocument();
      await chooseCoordinator(user, "Marcus Lee 0 active");
      await user.click(screen.getByRole("button", { name: "Assign coordinator" }));

      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit).toHaveBeenCalledWith("coord-2", "");
    });

    it("asks for a coordinator instead of submitting without one", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderDialog();

      await user.click(screen.getByRole("button", { name: "Assign coordinator" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Choose a coordinator.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    // SPM-81 AC06: an event that already has a coordinator is refused by the
    // database; the Lead sees why and the dialog stays open.
    it("SPM-81 AC06: shows why an assignment was refused and lets the Lead try again", async () => {
      const user = userEvent.setup();
      renderDialog({
        onSubmit: vi.fn().mockRejectedValue(new Error("This event already has a coordinator. Reassign it instead.")),
      });

      await chooseCoordinator(user, "Priya Shah 2 active");
      await user.click(screen.getByRole("button", { name: "Assign coordinator" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "This event already has a coordinator. Reassign it instead.",
      );
      expect(screen.getByRole("button", { name: "Assign coordinator" })).toBeEnabled();
    });

    it("uses a plain message when a failure has none", async () => {
      const user = userEvent.setup();
      renderDialog({ onSubmit: vi.fn().mockRejectedValue("refused") });

      await chooseCoordinator(user, "Priya Shah 2 active");
      await user.click(screen.getByRole("button", { name: "Assign coordinator" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("This event could not be assigned.");
    });

    it("shows progress and blocks a second click while saving", async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn(() => new Promise(() => {}));
      renderDialog({ onSubmit });

      await chooseCoordinator(user, "Priya Shah 2 active");
      await user.click(screen.getByRole("button", { name: "Assign coordinator" }));

      expect(await screen.findByRole("button", { name: "Saving…" })).toBeDisabled();
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("closes without assigning on Cancel", async () => {
      const user = userEvent.setup();
      const { onCancel, onSubmit } = renderDialog();

      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe("reassigning (SPM-84)", () => {
    // SPM-84 AC02: reassigning to the current coordinator is not on offer.
    it("SPM-84 AC02: does not offer the current coordinator", async () => {
      const user = userEvent.setup();
      renderDialog({ mode: "reassign", currentCoordinatorId: "coord-1" });

      expect(screen.getByRole("heading", { name: "Reassign this event" })).toBeInTheDocument();
      await user.click(screen.getByRole("combobox", { name: "Coordinator" }));

      expect(await screen.findByRole("option", { name: "Marcus Lee 0 active" })).toBeInTheDocument();
      expect(screen.queryByRole("option", { name: /Priya Shah/ })).not.toBeInTheDocument();
    });

    // The form and reassign_event_coordinator both require a reason, although
    // SPM-84 AC01 currently calls it optional: this asserts what the app does.
    it("requires a reason, ignoring spaces, before reassigning", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderDialog({ mode: "reassign", currentCoordinatorId: "coord-1" });

      await chooseCoordinator(user, "Marcus Lee 0 active");
      await user.type(screen.getByLabelText("Reason"), "   ");
      await user.click(screen.getByRole("button", { name: "Reassign event" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Explain why this event is being reassigned.");
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("SPM-84 AC01: reassigns to the chosen coordinator with the trimmed reason", async () => {
      const user = userEvent.setup();
      const { onSubmit } = renderDialog({ mode: "reassign", currentCoordinatorId: "coord-1" });

      await chooseCoordinator(user, "Marcus Lee 0 active");
      await user.type(screen.getByLabelText("Reason"), "  Priya is on leave  ");
      await user.click(screen.getByRole("button", { name: "Reassign event" }));

      expect(onSubmit).toHaveBeenCalledWith("coord-2", "Priya is on leave");
    });
  });
});
