import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock },
}));

import { listCoordinators } from "./all-events";

describe("listCoordinators", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("includes each coordinator's current count of active events", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            { id: "coord-1", full_name: "Priya Shah" },
            { id: "coord-2", full_name: "Marcus Lee" },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            { assigned_coordinator_id: "coord-1" },
            { assigned_coordinator_id: "coord-1" },
            { assigned_coordinator_id: "coord-2" },
          ],
          error: null,
        }),
      );

    await expect(listCoordinators()).resolves.toEqual([
      { id: "coord-1", fullName: "Priya Shah", activeEventCount: 2 },
      { id: "coord-2", fullName: "Marcus Lee", activeEventCount: 1 },
    ]);
    expect(fromMock).toHaveBeenCalledWith("profiles");
    expect(fromMock).toHaveBeenCalledWith("events");
  });

  it("defaults a coordinator with no active events to a count of 0", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({ data: [{ id: "coord-1", full_name: "Priya Shah" }], error: null }),
      )
      .mockReturnValueOnce(queryBuilder({ data: [], error: null }));

    await expect(listCoordinators()).resolves.toEqual([
      { id: "coord-1", fullName: "Priya Shah", activeEventCount: 0 },
    ]);
  });

  it("excludes draft, rejected, cancelled and completed events from the active count", async () => {
    const eventsQuery = queryBuilder({ data: [], error: null });
    fromMock
      .mockReturnValueOnce(queryBuilder({ data: [], error: null }))
      .mockReturnValueOnce(eventsQuery);

    await listCoordinators();

    expect(eventsQuery.in).toHaveBeenCalledWith(
      "status",
      expect.not.arrayContaining(["draft", "rejected", "cancelled", "completed"]),
    );
  });
});
