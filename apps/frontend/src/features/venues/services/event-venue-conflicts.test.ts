import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { listEventVenueConflicts } from "./event-venue-conflicts";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("listEventVenueConflicts", () => {
  // 202611010013: the event's open conflicts and which side has to move.
  it("returns each open conflict with the other booking or the venue block", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          booking_id: "b-2", must_move: true, conflicting_event_title: "F1 Event Part 1",
          conflicting_starts_at: "2099-04-06T00:00:00.000Z", conflicting_ends_at: "2099-04-06T01:45:00.000Z",
          block_reason: null, block_starts_at: null, block_ends_at: null, flagged_at: "2099-04-02T00:00:00.000Z",
        },
        {
          booking_id: "b-3", must_move: true, conflicting_event_title: null,
          conflicting_starts_at: null, conflicting_ends_at: null,
          block_reason: "Failed mic", block_starts_at: "2099-04-07T00:00:00.000Z",
          block_ends_at: "2099-04-07T01:00:00.000Z", flagged_at: "2099-04-03T00:00:00.000Z",
        },
      ],
      error: null,
    });

    await expect(listEventVenueConflicts("event-1")).resolves.toEqual([
      {
        bookingId: "b-2", mustMove: true, conflictingEventTitle: "F1 Event Part 1",
        conflictingStartsAt: "2099-04-06T00:00:00.000Z", conflictingEndsAt: "2099-04-06T01:45:00.000Z",
        blockReason: null, blockStartsAt: null, blockEndsAt: null, flaggedAt: "2099-04-02T00:00:00.000Z",
      },
      {
        bookingId: "b-3", mustMove: true, conflictingEventTitle: null,
        conflictingStartsAt: null, conflictingEndsAt: null,
        blockReason: "Failed mic", blockStartsAt: "2099-04-07T00:00:00.000Z",
        blockEndsAt: "2099-04-07T01:00:00.000Z", flaggedAt: "2099-04-03T00:00:00.000Z",
      },
    ]);
    expect(rpcMock).toHaveBeenCalledWith("event_venue_conflicts", { p_event_id: "event-1" });
  });

  it("throws a readable error when the conflicts cannot be loaded", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(listEventVenueConflicts("event-1")).rejects.toThrow(
      "This event's venue conflicts are unavailable.",
    );
  });
});
