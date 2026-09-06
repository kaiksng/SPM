import { describe, expect, it } from "vitest";

import {
  allowedEventStatusTransitions,
  canTransitionEventStatus,
  eventStatuses,
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
});
