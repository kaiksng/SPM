import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./status-badges";

describe("StatusBadge", () => {
  // SPM-12 AC01 + AC02: every lifecycle status in use is shown as a readable
  // label. Requested reads as "Pending" (the clarification story's wording).
  it.each([
    ["draft", "draft"],
    ["requested", "Pending"],
    ["planning", "planning"],
    ["pending_safety_check", "pending safety check"],
    ["confirmed", "confirmed"],
    ["completed", "completed"],
    ["rejected", "rejected"],
    ["cancelled", "cancelled"],
  ])("labels %s as %s", (status, label) => {
    render(<StatusBadge status={status} />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  // SPM-12 AC02: each status has its own colour, so progress reads at a glance.
  it("gives the finished, rejected and cancelled states distinct colours", () => {
    const { rerender } = render(<StatusBadge status="completed" />);
    const completed = screen.getByText("completed").className;
    rerender(<StatusBadge status="rejected" />);
    const rejected = screen.getByText("rejected").className;
    rerender(<StatusBadge status="cancelled" />);
    const cancelled = screen.getByText("cancelled").className;

    expect(new Set([completed, rejected, cancelled]).size).toBe(3);
  });
});
