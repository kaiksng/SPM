import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { rpcMock, fromMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock, from: fromMock } }));

import { listEventVenueConflicts, listVenueConflictsForCoordinator } from "./event-venue-conflicts";

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
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

describe("listVenueConflictsForCoordinator", () => {
  function row(bookingId: string, blockReason: string | null) {
    return {
      booking: {
        id: bookingId, event_id: `event-${bookingId}`, status: "approved",
        starts_at: "2099-04-06T02:00:00.000Z", ends_at: "2099-04-06T04:00:00.000Z",
        events: { title: `Event ${bookingId}` }, venues: { name: "SMU Connex" },
      },
      conflicting_block: blockReason === null ? null : { reason: blockReason },
    };
  }

  // One row per booking that has to move, with whether a replacement is in.
  it("returns each booking that has to move, once, with its replacement state", async () => {
    const conflicts = queryBuilder({ data: [row("b-1", null), row("b-1", "Failed mic"), row("b-2", null)], error: null });
    const replacements = queryBuilder({ data: [{ replaces_booking_id: "b-2" }], error: null });
    fromMock.mockImplementation((table: string) => (table === "venue_booking_conflicts" ? conflicts : replacements));

    await expect(listVenueConflictsForCoordinator()).resolves.toEqual([
      {
        bookingId: "b-1", eventId: "event-b-1", eventTitle: "Event b-1", venueName: "SMU Connex",
        bookingStartsAt: "2099-04-06T02:00:00.000Z", bookingEndsAt: "2099-04-06T04:00:00.000Z",
        blockReason: "Failed mic", state: "replacement_required",
      },
      {
        bookingId: "b-2", eventId: "event-b-2", eventTitle: "Event b-2", venueName: "SMU Connex",
        bookingStartsAt: "2099-04-06T02:00:00.000Z", bookingEndsAt: "2099-04-06T04:00:00.000Z",
        blockReason: null, state: "replacement_requested",
      },
    ]);
    expect(conflicts.is).toHaveBeenCalledWith("resolved_at", null);
    expect(conflicts.eq).toHaveBeenCalledWith("is_responsible", true);
  });

  it("returns nothing without looking for replacements when nothing has to move", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: [], error: null }));

    await expect(listVenueConflictsForCoordinator()).resolves.toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("throws a readable error when the conflicts cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listVenueConflictsForCoordinator()).rejects.toThrow("Venue conflicts are unavailable.");
  });
});
