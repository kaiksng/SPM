import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { listEventStatusHistory } from "./event-lifecycle";

beforeEach(() => {
  fromMock.mockReset();
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
