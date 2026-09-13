import { describe, expect, it } from "vitest";

import {
  allowedEventStatusTransitions,
  canTransitionEventStatus,
  eventStatuses,
  isSubmittedEventStatus,
  submittedEventStatuses,
} from "./event-status";

describe("event status transitions", () => {
  it("defines transitions for every status", () => {
    expect(Object.keys(allowedEventStatusTransitions).sort()).toEqual(
      [...eventStatuses].sort(),
    );
  });

  it("allows a draft event to be submitted", () => {
    expect(canTransitionEventStatus("draft", "submitted")).toBe(true);
  });

  it("does not allow a rejected event to be confirmed", () => {
    expect(canTransitionEventStatus("rejected", "confirmed")).toBe(false);
  });

  // PB-03 AC05.
  it("allows a draft event to become requested", () => {
    expect(canTransitionEventStatus("draft", "requested")).toBe(true);
  });

  // PB-03 AC05: a requested event is available for review, not for confirmation.
  it.each([
    ["clarification_requested", true],
    ["under_review", true],
    ["rejected", true],
    ["cancelled", true],
    ["confirmed", false],
    ["draft", false],
  ] as const)("moves requested to %s: %s", (to, expected) => {
    expect(canTransitionEventStatus("requested", to)).toBe(expected);
  });

  it("treats every status except draft as submitted", () => {
    expect(isSubmittedEventStatus("draft")).toBe(false);
    expect(isSubmittedEventStatus("requested")).toBe(true);
    expect(submittedEventStatuses).not.toContain("draft");
    expect(submittedEventStatuses).toHaveLength(eventStatuses.length - 1);
  });
});
