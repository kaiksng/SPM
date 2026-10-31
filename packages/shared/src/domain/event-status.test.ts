import { describe, expect, it } from "vitest";

import {
  allowedEventStatusTransitions,
  canTransitionEventStatus,
  eventStatuses,
  directEditBlockedMessage,
  isDirectEditBlocked,
  isPlanningAllowed,
  isSubmittedEventStatus,
  submittedEventStatuses,
} from "./event-status";

describe("event status transitions", () => {
  it("defines transitions for every status", () => {
    expect(Object.keys(allowedEventStatusTransitions).sort()).toEqual(
      [...eventStatuses].sort(),
    );
  });

  // "submitted" is retired as a reachable target — nothing ever produces it.
  it("does not allow a draft event to become submitted", () => {
    expect(canTransitionEventStatus("draft", "submitted")).toBe(false);
  });

  it("does not allow a rejected event to be confirmed", () => {
    expect(canTransitionEventStatus("rejected", "confirmed")).toBe(false);
  });

  // PB-03 AC05.
  it("allows a draft event to become requested", () => {
    expect(canTransitionEventStatus("draft", "requested")).toBe(true);
  });

  // PB-03 AC05: a requested event is available for review, not for confirmation.
  // "Enforce Revised Event Lifecycle Transitions" retires
  // "clarification_requested" as a reachable target from "requested" —
  // nothing ever produces it (a clarification round keeps status at
  // "requested" throughout).
  it.each([
    ["clarification_requested", false],
    // "under_review" is retired as a reachable target — nothing ever
    // produces it.
    ["under_review", false],
    ["planning", true],
    ["rejected", true],
    ["cancelled", true],
    ["confirmed", false],
    ["pending_safety_check", false],
    ["draft", false],
    // Approving now produces "planning", not "approved" — see "Approve or
    // Reject an Event Request" AC02.
    ["approved", false],
  ] as const)("moves requested to %s: %s", (to, expected) => {
    expect(canTransitionEventStatus("requested", to)).toBe(expected);
  });

  // Planning now routes through Pending Safety Check rather than straight to
  // Confirmed.
  it("moves a planning event to pending safety check, not confirmed", () => {
    expect(canTransitionEventStatus("planning", "pending_safety_check")).toBe(true);
    expect(canTransitionEventStatus("planning", "confirmed")).toBe(false);
  });

  it("lets pending safety check move to confirmed, back to planning, or cancelled", () => {
    expect(canTransitionEventStatus("pending_safety_check", "confirmed")).toBe(true);
    expect(canTransitionEventStatus("pending_safety_check", "planning")).toBe(true);
    expect(canTransitionEventStatus("pending_safety_check", "cancelled")).toBe(true);
    expect(canTransitionEventStatus("pending_safety_check", "rejected")).toBe(false);
  });

  it("allows a confirmed event to be marked completed or sent back to planning", () => {
    expect(canTransitionEventStatus("confirmed", "completed")).toBe(true);
    expect(canTransitionEventStatus("confirmed", "planning")).toBe(true);
  });

  it("does not allow completed to transition anywhere else", () => {
    expect(canTransitionEventStatus("completed", "cancelled")).toBe(false);
    expect(canTransitionEventStatus("completed", "confirmed")).toBe(false);
  });

  it("treats every status except draft as submitted", () => {
    expect(isSubmittedEventStatus("draft")).toBe(false);
    expect(isSubmittedEventStatus("requested")).toBe(true);
    expect(submittedEventStatuses).not.toContain("draft");
    expect(submittedEventStatuses).toHaveLength(eventStatuses.length - 1);
  });
});

describe("isPlanningAllowed", () => {
  it("blocks venue/equipment planning once an event is rejected or cancelled", () => {
    expect(isPlanningAllowed("rejected")).toBe(false);
    expect(isPlanningAllowed("cancelled")).toBe(false);
  });

  it("allows planning for every other status", () => {
    expect(isPlanningAllowed("planning")).toBe(true);
    expect(isPlanningAllowed("requested")).toBe(true);
    expect(isPlanningAllowed("confirmed")).toBe(true);
  });
});

describe("isDirectEditBlocked", () => {
  // SPM-11 AC01: Confirmed, Completed, Rejected and Cancelled events are finalised.
  it("blocks direct edits once an event is finalised", () => {
    expect(isDirectEditBlocked("confirmed")).toBe(true);
    expect(isDirectEditBlocked("completed")).toBe(true);
    expect(isDirectEditBlocked("rejected")).toBe(true);
    expect(isDirectEditBlocked("cancelled")).toBe(true);
  });

  it("allows direct edits for every other status", () => {
    expect(isDirectEditBlocked("draft")).toBe(false);
    expect(isDirectEditBlocked("requested")).toBe(false);
    expect(isDirectEditBlocked("clarification_requested")).toBe(false);
    expect(isDirectEditBlocked("planning")).toBe(false);
  });

  // SPM-11 AC01 lists exactly four finalised statuses; Pending Safety Check is not
  // one of them, even though it comes after Planning.
  it("does not treat Pending Safety Check as finalised", () => {
    expect(isDirectEditBlocked("pending_safety_check")).toBe(false);
  });
});

describe("directEditBlockedMessage", () => {
  // SPM-11 AC02: only a Confirmed event can still take a change request.
  it("points a Confirmed event to a change request", () => {
    expect(directEditBlockedMessage("confirmed")).toMatch(/submit a change request instead of editing it directly/);
  });

  it.each([
    ["completed", "This event has been completed. It can no longer be changed."],
    ["rejected", "This event was rejected. It can no longer be changed."],
    ["cancelled", "This event was cancelled. It can no longer be changed."],
  ])("tells a %s event it can no longer be changed, without a change request", (status, message) => {
    expect(directEditBlockedMessage(status)).toBe(message);
  });

  it("has no message for an event that is not finalised", () => {
    for (const status of ["draft", "requested", "planning", "pending_safety_check"]) {
      expect(directEditBlockedMessage(status)).toBeNull();
    }
  });
});
