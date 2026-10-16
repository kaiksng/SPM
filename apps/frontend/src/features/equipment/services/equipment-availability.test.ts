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

type EventRow = { id: string; title: string; status: string; starts_at: string | null; ends_at: string | null };

/** The events query and the removed-request reservations query each get their own result. */
function mockTables(events: EventRow[], orphanRows: unknown[] = []) {
  const eventsQuery = queryBuilder({ data: events, error: null });
  const reservationsQuery = queryBuilder({ data: orphanRows, error: null });
  fromMock.mockImplementation((table: string) => (table === "events" ? eventsQuery : reservationsQuery));
  return { eventsQuery, reservationsQuery };
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  loadStatusesMock.mockReset();
  mockTables([{ id: "event-1", title: "Spring Expo", status: "pending_safety_check", starts_at: null, ends_at: null }]);
  rpcMock.mockResolvedValue({ data: [checkRow("req-1"), checkRow("req-2")], error: null });
});

describe("listEventEquipmentAvailability (SPM-28)", () => {
  it("lists Pending Safety Check events too", async () => {
    const { eventsQuery } = mockTables([]);

    await listEventEquipmentAvailability();

    expect(eventsQuery.in).toHaveBeenCalledWith("status", ["requested", "planning", "pending_safety_check", "confirmed"]);
  });

  // AC02: until staff set a status, it follows the reservation and availability.
  // SPM-28 AC02: until staff set one, the status is worked out — Arranged when
  // reserved in full, In progress when partly, Issue when it needs re-checking or
  // cannot be reserved in full (short, unavailable, unknown, retired), otherwise
  // Not started. A status set by hand wins.
  it("works out each item's status until staff set one by hand", async () => {
    mockTables([{ id: "event-1", title: "Spring Expo", status: "planning", starts_at: null, ends_at: null }]);
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
        { ...checkRow("none-free"), status: "unavailable", available_quantity: 0 },
        { ...checkRow("retired"), item_retired: true },
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
      ["none-free", "issue", true],
      ["retired", "issue", true],
    ]);
  });

  // SPM-28 AC02: an event awaiting its safety check cannot be reserved, so it is an Issue.
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

  // AC4/AC5: a reservation left by a removed request still holds stock, so it is listed to be released.
  it("lists reservations whose request was removed, including events with no requests left", async () => {
    loadStatusesMock.mockResolvedValue(new Map());
    const orphan = (id: string, eventId: string, title: string, startsAt: string) => ({
      id,
      quantity: 5,
      starts_at: "2099-01-01T01:00:00Z",
      ends_at: "2099-01-01T05:00:00Z",
      recheck_reason: "The equipment request was removed",
      decided_at: "2098-12-01T00:00:00Z",
      equipment_item: { name: "Projector" },
      reserved_by: { full_name: "Tess Support" },
      event: { id: eventId, title, status: "planning", starts_at: startsAt, ends_at: null },
    });
    const { reservationsQuery } = mockTables(
      [{ id: "event-1", title: "Spring Expo", status: "planning", starts_at: "2099-01-02T00:00:00Z", ends_at: null }],
      [orphan("res-1", "event-1", "Spring Expo", "2099-01-02T00:00:00Z"), orphan("res-2", "event-2", "Old Gala", "2099-01-01T00:00:00Z")],
    );

    const events = await listEventEquipmentAvailability();

    expect(fromMock).toHaveBeenCalledWith("equipment_reservations");
    expect(reservationsQuery.eq).toHaveBeenCalledWith("status", "approved");
    expect(reservationsQuery.is).toHaveBeenCalledWith("requirement_id", null);
    // Soonest first; the event with no requests left is still listed.
    expect(events.map((event) => [event.id, event.orphanedReservations?.map((reservation) => reservation.id)])).toEqual([
      ["event-2", ["res-2"]],
      ["event-1", ["res-1"]],
    ]);
    expect(events[0]?.orphanedReservations?.[0]).toEqual({
      id: "res-2",
      equipmentName: "Projector",
      quantity: 5,
      startsAt: "2099-01-01T01:00:00Z",
      endsAt: "2099-01-01T05:00:00Z",
      recheckReason: "The equipment request was removed",
      reservedByName: "Tess Support",
      reservedAt: "2098-12-01T00:00:00Z",
    });
  });
});
