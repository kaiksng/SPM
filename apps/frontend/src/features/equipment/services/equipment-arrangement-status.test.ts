import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

import { loadEquipmentArrangementStatuses, updateEquipmentArrangement } from "./equipment-arrangement-status";

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("loadEquipmentArrangementStatuses", () => {
  it("groups entries by requirement, latest first as current (AC03)", async () => {
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

    const result = await loadEquipmentArrangementStatuses(["event-1", "event-2"]);

    expect(fromMock).toHaveBeenCalledWith("equipment_arrangement_updates");
    expect(query.in).toHaveBeenCalledWith("event_id", ["event-1", "event-2"]);
    expect(result.get("req-1")).toMatchObject({
      status: "arranged",
      note: "Delivered",
      updatedByName: "Lee",
      updatedAt: "2099-01-01T03:00:00Z",
    });
    // An unknown stored status is left out rather than mislabelled.
    expect(result.get("req-1")?.history.map((entry) => entry.status)).toEqual(["in_progress", "arranged"]);
    expect(result.get("req-2")).toMatchObject({ status: "issue", updatedByName: null });
  });

  it("does not query when there are no events", async () => {
    expect(await loadEquipmentArrangementStatuses([])).toEqual(new Map());
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reports a load failure", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));
    await expect(loadEquipmentArrangementStatuses(["event-1"])).rejects.toThrow(
      "We couldn't load the equipment arrangement statuses.",
    );
  });
});

describe("updateEquipmentArrangement", () => {
  // AC04: the status and trimmed note are sent.
  it("sends the status and note and reports a saved change", async () => {
    rpcMock.mockResolvedValue({ data: 7, error: null });

    await expect(updateEquipmentArrangement("req-1", { status: "issue", note: "  One faulty  " })).resolves.toBe(true);
    expect(rpcMock).toHaveBeenCalledWith("update_equipment_arrangement", {
      p_requirement_id: "req-1",
      p_status: "issue",
      p_note: "One faulty",
    });
  });

  it("reports when nothing changed", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(updateEquipmentArrangement("req-1", { status: "issue", note: "" })).resolves.toBe(false);
  });

  // AC06: the database's refusal is shown as is.
  it("passes on the database's refusal", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only Technical Support Staff can update equipment arrangements" },
    });
    await expect(updateEquipmentArrangement("req-1", { status: "arranged", note: "" })).rejects.toThrow(
      "Only Technical Support Staff can update equipment arrangements",
    );
  });
});
