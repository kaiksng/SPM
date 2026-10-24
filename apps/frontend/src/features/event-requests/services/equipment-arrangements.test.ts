import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { listEquipmentArrangements } from "./equipment-arrangements";

const row = (overrides: Record<string, unknown>) => ({
  id: "res-1",
  requirement_id: "req-1",
  quantity: 2,
  starts_at: "2099-07-01T01:00:00.000Z",
  ends_at: "2099-07-01T06:00:00.000Z",
  status: "approved",
  decided_at: "2099-06-20T02:00:00.000Z",
  needs_recheck: false,
  recheck_reason: null,
  released_at: null,
  equipment_item: { name: "Projector" },
  reserved_by: { full_name: "Tess Support" },
  history: [
    { id: 1, action: "reserved", details: { quantity: 2 }, occurred_at: "2099-06-20T02:00:00.000Z", actor: { full_name: "Tess Support" } },
  ],
  ...overrides,
});

beforeEach(() => {
  fromMock.mockReset();
});

describe("listEquipmentArrangements", () => {
  // SPM-46 AC06: a reservation released because the event was completed says so.
  it("takes the release reason from the latest release in the history", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          row({
            status: "cancelled",
            released_at: "2099-07-01T08:00:00.000Z",
            history: [
              { id: 3, action: "released", details: { quantity: 2, reason: "The event was completed" }, occurred_at: "2099-07-01T08:00:00.000Z", actor: null },
              { id: 1, action: "reserved", details: { quantity: 2 }, occurred_at: "2099-06-20T02:00:00.000Z", actor: { full_name: "Tess Support" } },
            ],
          }),
        ],
        error: null,
      }),
    );

    const [arrangement] = await listEquipmentArrangements("event-1");

    expect(arrangement).toMatchObject({
      status: "released",
      releasedAt: "2099-07-01T08:00:00.000Z",
      releaseReason: "The event was completed",
      reservedByName: "Tess Support",
    });
    expect(arrangement?.history.map((entry) => entry.id)).toEqual([1, 3]);
  });

  it("has no release reason for a reservation that is still held", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: [row({})], error: null }));

    const [arrangement] = await listEquipmentArrangements("event-1");

    expect(arrangement).toMatchObject({ status: "reserved", releaseReason: null });
  });
});
