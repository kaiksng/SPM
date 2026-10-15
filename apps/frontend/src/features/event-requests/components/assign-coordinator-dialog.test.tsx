import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssignCoordinatorDialog } from "./assign-coordinator-dialog";

const coordinators = [
  { id: "coord-1", fullName: "Priya Shah", activeEventCount: 2 },
  { id: "coord-2", fullName: "Marcus Lee", activeEventCount: 0 },
];

describe("AssignCoordinatorDialog", () => {
  it("shows each coordinator's active event count next to their name", async () => {
    const user = userEvent.setup();
    render(
      <AssignCoordinatorDialog
        mode="assign"
        coordinators={coordinators}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Coordinator" }));

    const priya = await screen.findByRole("option", { name: "Priya Shah 2 active" });
    const marcus = screen.getByRole("option", { name: "Marcus Lee 0 active" });

    // The count is pushed to the right of the name, not just appended after it.
    expect(priya.querySelector(".justify-between")).not.toBeNull();
    expect(marcus.querySelector(".justify-between")).not.toBeNull();
  });
});
