import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

import { assignEventCoordinator, listAllEvents, listCoordinators } from "./all-events";

// SPM-80: every event visible to the Event Coordinator Lead.
describe("listAllEvents", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("maps every event row, including organiser and coordinator names", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: "event-1",
            title: "Welcome Mixer",
            purpose: "Orientation",
            status: "requested",
            starts_at: "2099-01-01T10:00:00.000Z",
            ends_at: "2099-01-01T12:00:00.000Z",
            updated_at: "2099-01-01T09:00:00.000Z",
            submitted_at: "2098-12-31T09:00:00.000Z",
            expected_attendance: 50,
            assigned_coordinator_id: "coord-1",
            organiser: { full_name: "Olivia Organiser" },
            coordinator: { full_name: "Coordinator One" },
          },
        ],
        error: null,
      }),
    );

    await expect(listAllEvents()).resolves.toEqual([
      {
        id: "event-1",
        title: "Welcome Mixer",
        purpose: "Orientation",
        status: "requested",
        startsAt: "2099-01-01T10:00:00.000Z",
        endsAt: "2099-01-01T12:00:00.000Z",
        updatedAt: "2099-01-01T09:00:00.000Z",
        submittedAt: "2098-12-31T09:00:00.000Z",
        expectedAttendance: 50,
        organiserName: "Olivia Organiser",
        assignedCoordinatorId: "coord-1",
        assignedCoordinatorName: "Coordinator One",
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("events");
  });

  it("maps a null organiser or coordinator to a null name rather than throwing", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: "event-2",
            title: "Unassigned Gala",
            purpose: null,
            status: "requested",
            starts_at: null,
            ends_at: null,
            updated_at: "2099-01-01T09:00:00.000Z",
            submitted_at: "2098-12-31T09:00:00.000Z",
            expected_attendance: null,
            assigned_coordinator_id: null,
            organiser: null,
            coordinator: null,
          },
        ],
        error: null,
      }),
    );

    const [event] = await listAllEvents();

    expect(event?.organiserName).toBeNull();
    expect(event?.assignedCoordinatorName).toBeNull();
    expect(event?.assignedCoordinatorId).toBeNull();
  });

  it("throws a friendly error when the query fails", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "db error" } }));

    await expect(listAllEvents()).rejects.toThrow("We couldn't load events.");
  });
});

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

// SPM-80: the Lead assigns/reassigns a coordinator from the oversight view.
describe("assignEventCoordinator", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("calls reassign_event_coordinator with the event, coordinator and reason", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await assignEventCoordinator("event-1", "coord-2", "Workload rebalance");

    expect(rpcMock).toHaveBeenCalledWith("reassign_event_coordinator", {
      p_event_id: "event-1",
      p_new_coordinator_id: "coord-2",
      p_reason: "Workload rebalance",
    });
  });

  it("throws the database error message when assignment fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Assigning an event that already has a coordinator is refused" } });

    await expect(assignEventCoordinator("event-1", "coord-2", "")).rejects.toThrow(
      "Assigning an event that already has a coordinator is refused",
    );
  });
});
