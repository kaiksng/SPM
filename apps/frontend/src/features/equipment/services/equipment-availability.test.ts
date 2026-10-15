import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock, loadStatusesMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  loadStatusesMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));
vi.mock("@/features/equipment/services/equipment-arrangement-status", () => ({
  loadEquipmentArrangementStatuses: (...args: unknown[]) => loadStatusesMock(...args),
}));

import { listEventEquipmentAvailability } from "./equipment-availability";

const checkRow = (requirementId: string) => ({
  requirement_id: requirementId,
  event_id: "event-1",
  equipment_item_id: "item-proj",
  equipment_name: "Projector",
  item_code: "proj",
  item_retired: false,
  requested_quantity: 2,
  required_from: "2099-01-01T01:00:00Z",
  required_until: "2099-01-01T05:00:00Z",
  technical_requirements: null,
  total_units: 100,
  reserved_quantity: 0,
  unavailable_quantity: 0,
  available_quantity: 100,
  status: "available",
  reservation_id: null,
  reservation_quantity: null,
  reservation_needs_recheck: false,
  reservation_recheck_reason: null,
  reserved_by_name: null,
  reserved_at: null,
});

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  loadStatusesMock.mockReset();
  fromMock.mockReturnValue(
    queryBuilder({
      data: [{ id: "event-1", title: "Spring Expo", status: "pending_safety_check", starts_at: null, ends_at: null }],
      error: null,
    }),
  );
  rpcMock.mockResolvedValue({ data: [checkRow("req-1"), checkRow("req-2")], error: null });
});

describe("listEventEquipmentAvailability (SPM-28)", () => {
  it("lists Pending Safety Check events too", async () => {
    const query = queryBuilder({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await listEventEquipmentAvailability();

    expect(query.in).toHaveBeenCalledWith("status", ["requested", "planning", "pending_safety_check", "confirmed"]);
  });

  // AC02: until staff set a status, it follows the reservation and availability.
  it("works out each item's status until staff set one by hand", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [{ id: "event-1", title: "Spring Expo", status: "planning", starts_at: null, ends_at: null }],
        error: null,
      }),
    );
    const reserved = (quantity: number, needsRecheck = false) => ({
      reservation_id: "res",
      reservation_quantity: quantity,
      reservation_needs_recheck: needsRecheck,
    });
    rpcMock.mockResolvedValue({
      data: [
        { ...checkRow("set-by-hand"), ...reserved(2) },
        checkRow("ready"),
        { ...checkRow("reserved"), ...reserved(2) },
        { ...checkRow("partly"), ...reserved(1) },
        { ...checkRow("flagged"), ...reserved(2, true) },
        { ...checkRow("short"), status: "partially_available", available_quantity: 1 },
        { ...checkRow("unknown"), status: "unknown", equipment_item_id: null },
      ],
      error: null,
    });
    loadStatusesMock.mockResolvedValue(
      new Map([["set-by-hand", { status: "issue", automatic: false, note: "Faulty", updatedByName: "Sam", updatedAt: "2099-01-01T00:00:00Z", history: [] }]]),
    );

    const [event] = await listEventEquipmentAvailability();

    expect(loadStatusesMock).toHaveBeenCalledWith(["event-1"]);
    expect(event?.results.map((result) => [result.requirementId, result.arrangement?.status, result.arrangement?.automatic])).toEqual([
      ["set-by-hand", "issue", false],
      ["ready", "not_started", true],
      ["reserved", "arranged", true],
      ["partly", "in_progress", true],
      ["flagged", "issue", true],
      ["short", "issue", true],
      ["unknown", "issue", true],
    ]);
  });

  it("treats an unreserved item on a Pending Safety Check event as an issue", async () => {
    loadStatusesMock.mockResolvedValue(new Map());

    const [event] = await listEventEquipmentAvailability();

    expect(event?.results.map((result) => result.arrangement?.status)).toEqual(["issue", "issue"]);
  });

  it("still returns availability when the arrangement statuses can't be loaded", async () => {
    loadStatusesMock.mockRejectedValue(new Error("We couldn't load the equipment arrangement statuses."));

    const [event] = await listEventEquipmentAvailability();

    expect(event?.results).toHaveLength(2);
    expect(event?.results.every((result) => result.arrangement === null)).toBe(true);
  });
});
