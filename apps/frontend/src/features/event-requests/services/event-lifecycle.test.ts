import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import {
  completeEvent,
  listEventStatusHistory,
  loadEventCompletionAvailableAt,
} from "./event-lifecycle";

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("listEventStatusHistory", () => {
  // SPM-09 AC05: the Lifecycle section lists status changes oldest first.
  it("reads the event's status history oldest first, with id as the tiebreaker", async () => {
    const query = queryBuilder({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await listEventStatusHistory("event-1");

    expect(fromMock).toHaveBeenCalledWith("event_status_history");
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.order.mock.calls).toEqual([
      ["changed_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  // SPM-09 AC05 + SPM-12 AC03: every entry carries its previous status, new status,
  // actor (or none, for a system action) and time.
  it("maps each row to its previous and new status, actor and time", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: 1,
            from_status: null,
            to_status: "draft",
            changed_at: "2099-01-01T02:00:00.000Z",
            changed_by_id: "organiser-1",
            changed_by: { full_name: "Jasmine" },
          },
          {
            id: 2,
            from_status: "requested",
            to_status: "planning",
            changed_at: "2099-01-02T02:00:00.000Z",
            changed_by_id: null,
            changed_by: null,
          },
        ],
        error: null,
      }),
    );

    await expect(listEventStatusHistory("event-1")).resolves.toEqual([
      {
        id: 1,
        fromStatus: null,
        toStatus: "draft",
        changedById: "organiser-1",
        changedByName: "Jasmine",
        changedAt: "2099-01-01T02:00:00.000Z",
      },
      {
        id: 2,
        fromStatus: "requested",
        toStatus: "planning",
        changedById: null,
        changedByName: null,
        changedAt: "2099-01-02T02:00:00.000Z",
      },
    ]);
  });

  // SPM-09 AC02: RLS hides another coordinator's event history as no rows, not an error.
  it("returns an empty list when no rows are visible", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(listEventStatusHistory("event-1")).resolves.toEqual([]);
  });

  // SPM-09 AC05 (error case): a failed load gives a readable message, not a raw error.
  it("throws a readable error when the history cannot be loaded", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "XX000", message: "connection reset" } }),
    );

    await expect(listEventStatusHistory("event-1")).rejects.toThrow(
      "This event's status history is unavailable.",
    );
  });
});

describe("completeEvent", () => {
  // SPM-46 AC01: the assigned coordinator's request goes to complete_event.
  it("calls complete_event with the event id", async () => {
    rpcMock.mockResolvedValue({ data: { eventId: "event-1", status: "completed" }, error: null });

    await expect(completeEvent("event-1")).resolves.toEqual({ eventId: "event-1", status: "completed" });
    expect(rpcMock).toHaveBeenCalledWith("complete_event", { p_event_id: "event-1" });
  });

  // SPM-46 AC02: the coordinator is told the earliest time it can be completed.
  it("passes a check_violation message through to the coordinator", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "This event can be marked completed from 1 Jan 2099, 6:30 pm" },
    });

    await expect(completeEvent("event-1")).rejects.toThrow(
      "This event can be marked completed from 1 Jan 2099, 6:30 pm",
    );
  });

  it("hides any other database error behind a readable message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only the assigned coordinator can mark this event completed" },
    });

    await expect(completeEvent("event-1")).rejects.toThrow("This event could not be marked completed.");
  });
});

describe("loadEventCompletionAvailableAt", () => {
  // SPM-46 AC02: the end time plus turnaround, from the same rule complete_event enforces.
  it("returns the earliest completion time for the event", async () => {
    rpcMock.mockResolvedValue({ data: "2099-01-01T10:30:00+00:00", error: null });

    await expect(loadEventCompletionAvailableAt("event-1")).resolves.toBe("2099-01-01T10:30:00+00:00");
    expect(rpcMock).toHaveBeenCalledWith("event_completion_available_at", { p_event_id: "event-1" });
  });

  it("throws a readable error when the time cannot be loaded", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "connection reset" } });

    await expect(loadEventCompletionAvailableAt("event-1")).rejects.toThrow(
      "When this event can be marked completed is unavailable.",
    );
  });
});
