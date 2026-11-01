import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import {
  listEventCoordinatorAssignmentHistory,
  listEventCoordinatorReassignments,
} from "./event-reassignment";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("listEventCoordinatorAssignmentHistory", () => {
  // SPM-84 AC03: the full assignment history is viewable, and the row with no
  // end time is the current assignment.
  it("SPM-84 AC03: maps each assignment with who made it, why, and when it ended", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 2,
          previous_coordinator_id: "coord-1",
          previous_coordinator_name: "Priya Shah",
          new_coordinator_id: "coord-2",
          new_coordinator_name: "Marcus Lee",
          changed_by_id: "lead-1",
          changed_by_name: "Tom Lead",
          reason: "Priya is on leave",
          changed_at: "2099-01-02T02:00:00.000Z",
          ended_at: null,
        },
      ],
      error: null,
    });

    await expect(listEventCoordinatorAssignmentHistory("event-1")).resolves.toEqual([
      {
        id: 2,
        previousCoordinatorId: "coord-1",
        previousCoordinatorName: "Priya Shah",
        newCoordinatorId: "coord-2",
        newCoordinatorName: "Marcus Lee",
        changedById: "lead-1",
        changedByName: "Tom Lead",
        reason: "Priya is on leave",
        changedAt: "2099-01-02T02:00:00.000Z",
        endedAt: null,
      },
    ]);
    expect(rpcMock).toHaveBeenCalledWith("list_event_coordinator_history", { p_event_id: "event-1" });
  });

  it("returns an empty history when nothing comes back", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(listEventCoordinatorAssignmentHistory("event-1")).resolves.toEqual([]);
  });

  it("says the history is unavailable when the read is refused", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(listEventCoordinatorAssignmentHistory("event-1")).rejects.toThrow(
      "This event's assignment history is unavailable.",
    );
  });
});

describe("listEventCoordinatorReassignments", () => {
  it("maps each earlier hand-off", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          id: 1,
          previous_coordinator_id: "coord-1",
          previous_coordinator_name: "Priya Shah",
          new_coordinator_id: "coord-2",
          new_coordinator_name: "Marcus Lee",
          reason: "Handover",
          changed_at: "2099-01-01T02:00:00.000Z",
        },
      ],
      error: null,
    });

    await expect(listEventCoordinatorReassignments("event-1")).resolves.toEqual([
      {
        id: 1,
        previousCoordinatorId: "coord-1",
        previousCoordinatorName: "Priya Shah",
        newCoordinatorId: "coord-2",
        newCoordinatorName: "Marcus Lee",
        reason: "Handover",
        changedAt: "2099-01-01T02:00:00.000Z",
      },
    ]);
    expect(rpcMock).toHaveBeenCalledWith("list_auto_event_coordinator_reassignments", {
      p_event_id: "event-1",
    });
  });

  it("returns an empty history when nothing comes back", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(listEventCoordinatorReassignments("event-1")).resolves.toEqual([]);
  });

  it("says the history is unavailable when the read is refused", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "permission denied" } });

    await expect(listEventCoordinatorReassignments("event-1")).rejects.toThrow(
      "This event's reassignment history is unavailable.",
    );
  });
});
