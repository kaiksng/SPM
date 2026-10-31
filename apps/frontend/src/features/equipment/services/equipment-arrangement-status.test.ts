import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { loadEquipmentArrangementHistory } from "./equipment-arrangement-status";

beforeEach(() => {
  fromMock.mockReset();
});

describe("loadEquipmentArrangementHistory", () => {
  it("groups entries by requirement, oldest first (AC03)", async () => {
    const query = queryBuilder({
      data: [
        { id: 1, requirement_id: "req-1", status: "in_progress", note: "Sourcing", updated_at: "2099-01-01T01:00:00Z", updated_by_profile: { full_name: "Sam" } },
        { id: 2, requirement_id: "req-2", status: "issue", note: null, updated_at: "2099-01-01T02:00:00Z", updated_by_profile: null },
        { id: 3, requirement_id: "req-1", status: "arranged", note: "Delivered", updated_at: "2099-01-01T03:00:00Z", updated_by_profile: { full_name: "Lee" } },
        { id: 4, requirement_id: "req-1", status: "mystery", note: null, updated_at: "2099-01-01T04:00:00Z", updated_by_profile: null },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    const result = await loadEquipmentArrangementHistory(["event-1", "event-2"]);

    expect(fromMock).toHaveBeenCalledWith("equipment_arrangement_updates");
    expect(query.in).toHaveBeenCalledWith("event_id", ["event-1", "event-2"]);
    // An unknown stored status is left out rather than mislabelled.
    expect(result.get("req-1")?.map((entry) => entry.status)).toEqual(["in_progress", "arranged"]);
    expect(result.get("req-1")?.[1]).toMatchObject({ note: "Delivered", updatedByName: "Lee" });
    expect(result.get("req-2")).toEqual([
      { id: 2, status: "issue", note: null, updatedByName: null, updatedAt: "2099-01-01T02:00:00Z" },
    ]);
  });

  it("does not query when there are no events", async () => {
    expect(await loadEquipmentArrangementHistory([])).toEqual(new Map());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reports a load failure", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));
    await expect(loadEquipmentArrangementHistory(["event-1"])).rejects.toThrow(
      "We couldn't load the equipment arrangement statuses.",
    );
  });
});
