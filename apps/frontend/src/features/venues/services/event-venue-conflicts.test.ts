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
  const since = "2099-03-23T00:00:00.000Z";

  function row(bookingId: string, blockReason: string | null, resolvedAt: string | null = null, status = "approved") {
    return {
      resolved_at: resolvedAt,
      booking: {
        id: bookingId, event_id: `event-${bookingId}`, status,
        starts_at: "2099-04-06T02:00:00.000Z", ends_at: "2099-04-06T04:00:00.000Z",
        events: { title: `Event ${bookingId}` }, venues: { name: "SMU Connex" },
      },
      conflicting_block: blockReason === null ? null : { reason: blockReason },
    };
  }

  const common = {
    eventTitle: "", venueName: "SMU Connex",
    bookingStartsAt: "2099-04-06T02:00:00.000Z", bookingEndsAt: "2099-04-06T04:00:00.000Z",
  };

  // One row per booking that has to move: open ones with their replacement
  // state, and recently resolved ones like disruptions.
  it("returns each booking once, open or recently resolved", async () => {
    const conflicts = queryBuilder({
      data: [
        row("b-1", null),
        row("b-1", "Failed mic"),
        row("b-2", null),
        row("b-3", "Failed mic", "2099-04-01T00:00:00.000Z", "cancelled"),
        // Still open on a booking released by hand: no longer applies.
        row("b-4", null, null, "cancelled"),
      ],
      error: null,
    });
    const replacements = queryBuilder({ data: [{ replaces_booking_id: "b-2" }], error: null });
    fromMock.mockImplementation((table: string) => (table === "venue_booking_conflicts" ? conflicts : replacements));

    await expect(listVenueConflictsForCoordinator(since)).resolves.toEqual([
      { ...common, bookingId: "b-1", eventId: "event-b-1", eventTitle: "Event b-1", blockReason: "Failed mic",
        state: "replacement_required", resolvedAt: null },
      { ...common, bookingId: "b-2", eventId: "event-b-2", eventTitle: "Event b-2", blockReason: null,
        state: "replacement_requested", resolvedAt: null },
      { ...common, bookingId: "b-3", eventId: "event-b-3", eventTitle: "Event b-3", blockReason: "Failed mic",
        state: "resolved", resolvedAt: "2099-04-01T00:00:00.000Z" },
    ]);
    expect(conflicts.eq).toHaveBeenCalledWith("is_responsible", true);
    expect(conflicts.or).toHaveBeenCalledWith(`resolved_at.is.null,resolved_at.gte.${since}`);
    expect(replacements.in).toHaveBeenCalledWith("replaces_booking_id", ["b-1", "b-2"]);
  });

  it("returns nothing without looking for replacements when nothing has to move", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: [], error: null }));

    await expect(listVenueConflictsForCoordinator(since)).resolves.toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("throws a readable error when the conflicts cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listVenueConflictsForCoordinator(since)).rejects.toThrow("Venue conflicts are unavailable.");
  });
});
