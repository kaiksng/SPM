import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { loadEventFieldHistory } from "./field-history";

beforeEach(() => {
  fromMock.mockReset();
});

describe("loadEventFieldHistory", () => {
  // SPM-09 AC05: entries come back oldest first; id breaks ties between rows one
  // save logged with the same changed_at.
  it("reads the event's field changes oldest first, with id as the tiebreaker", async () => {
    const query = queryBuilder({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await loadEventFieldHistory("event-1");

    expect(fromMock).toHaveBeenCalledWith("event_field_changes");
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.order.mock.calls).toEqual([
      ["changed_at", { ascending: true }],
      ["id", { ascending: true }],
    ]);
  });

  // SPM-09 AC05: every entry carries its previous value, new value, actor and time.
  it("maps each row to its field, previous and new value, actor and time", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: 1,
            field_name: "expectedAttendance",
            previous_value: "80",
            new_value: "120",
            changed_at: "2099-01-01T02:00:00.000Z",
            changed_by: { full_name: "Joyce" },
          },
          {
            id: 2,
            field_name: "venue.layoutNotes",
            previous_value: null,
            new_value: "Theatre",
            changed_at: "2099-01-02T02:00:00.000Z",
            changed_by: null,
          },
        ],
        error: null,
      }),
    );

    await expect(loadEventFieldHistory("event-1")).resolves.toEqual([
      {
        id: 1,
        fieldName: "expectedAttendance",
        previousValue: "80",
        newValue: "120",
        changedByName: "Joyce",
        changedAt: "2099-01-01T02:00:00.000Z",
      },
      {
        id: 2,
        fieldName: "venue.layoutNotes",
        previousValue: null,
        newValue: "Theatre",
        changedByName: null,
        changedAt: "2099-01-02T02:00:00.000Z",
      },
    ]);
  });

  // SPM-09 AC02: RLS hides another coordinator's event history as no rows, not an error.
  it("returns an empty list when no rows are visible", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(loadEventFieldHistory("event-1")).resolves.toEqual([]);
  });

  it("throws a readable error when the history cannot be loaded", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "XX000", message: "connection reset" } }),
    );

    await expect(loadEventFieldHistory("event-1")).rejects.toThrow(
      "The change history for this event is unavailable.",
    );
  });
});
