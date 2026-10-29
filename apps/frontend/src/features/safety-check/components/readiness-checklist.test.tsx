import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { EventReadiness } from "@spm/shared";
import { describe, expect, it, vi } from "vitest";

import { ReadinessChecklist } from "./readiness-checklist";

function readiness(overrides: Partial<EventReadiness> = {}): EventReadiness {
  return {
    ready: false,
    venues: [],
    venueArrangementStatus: "pending",
    equipment: [],
    equipmentArrangementStatus: "not_required",
    outstandingItems: [],
    ...overrides,
  };
}

describe("ReadinessChecklist", () => {
  // SPM-33 AC01/AC07: every venue booking and equipment requirement shows
  // its own Complete/Pending/Needs Review status.
  it("shows each venue booking's and equipment requirement's readiness status", () => {
    render(
      <ReadinessChecklist
        readiness={readiness({
          venues: [
            { bookingId: "booking-1", venueName: "Main Hall", isMainVenue: true, status: "complete", needsReviewReason: null },
            { bookingId: "booking-2", venueName: "Breakout Room", isMainVenue: false, status: "pending", needsReviewReason: null },
          ],
          equipment: [
            {
              requirementId: "req-1",
              equipmentName: "Projector",
              quantity: 1,
              status: "needs_review",
              needsReviewReason: "Reservation needs re-checking.",
            },
          ],
        })}
      />,
    );

    expect(screen.getByText("Main Hall")).toBeInTheDocument();
    expect(screen.getByText("Main venue")).toBeInTheDocument();
    expect(screen.getByText("Breakout Room")).toBeInTheDocument();
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.getByText("Reservation needs re-checking.")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getAllByText("Pending")).toHaveLength(1);
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
  });

  it("shows placeholder copy when no venue or equipment arrangements exist", () => {
    render(<ReadinessChecklist readiness={readiness()} />);

    expect(screen.getByText("No active venue booking for this event.")).toBeInTheDocument();
    expect(screen.getByText("No equipment was requested for this event.")).toBeInTheDocument();
  });

  // SPM-33: the one writable action — resolving a flagged item — only
  // appears for Needs Review items, and only when the caller allows it.
  it("offers 'Mark resolved' only for a Needs Review booking when canResolve is true", async () => {
    const onResolveBooking = vi.fn();
    const user = userEvent.setup();
    render(
      <ReadinessChecklist
        readiness={readiness({
          venues: [
            { bookingId: "booking-1", venueName: "Main Hall", isMainVenue: true, status: "needs_review", needsReviewReason: "Conflict detected." },
            { bookingId: "booking-2", venueName: "Breakout Room", isMainVenue: false, status: "complete", needsReviewReason: null },
          ],
        })}
        canResolve
        onResolveBooking={onResolveBooking}
      />,
    );

    const buttons = screen.getAllByRole("button", { name: "Mark resolved" });
    expect(buttons).toHaveLength(1);

    await user.click(buttons[0]!);
    expect(onResolveBooking).toHaveBeenCalledWith("booking-1");
  });

  it("does not offer 'Mark resolved' when canResolve is false", () => {
    render(
      <ReadinessChecklist
        readiness={readiness({
          venues: [
            { bookingId: "booking-1", venueName: "Main Hall", isMainVenue: true, status: "needs_review", needsReviewReason: "Conflict detected." },
          ],
        })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Mark resolved" })).not.toBeInTheDocument();
  });
});
