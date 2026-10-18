import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { listAssignedEvents } from "./assigned-events";

const coordinatorId = "20000000-0000-0000-0000-000000000002";

const row = {
  id: "event-1",
  title: "Career Fair",
  purpose: "Connect students with employers",
  status: "planning",
  starts_at: "2099-01-01T02:00:00.000Z",
  ends_at: "2099-01-01T08:00:00.000Z",
  updated_at: "2098-12-02T02:00:00.000Z",
  submitted_at: "2098-12-01T02:00:00.000Z",
  organiser: { full_name: "Jasmine" },
};

beforeEach(() => {
  fromMock.mockReset();
});

describe("listAssignedEvents", () => {
  // SPM-15 AC02: the list is scoped to events assigned to the signed-in
  // coordinator, so other coordinators' events are never requested.
  it("reads only the events assigned to the signed-in coordinator, newest first", async () => {
    const query = queryBuilder({ data: [row], error: null });
    fromMock.mockReturnValue(query);

    await listAssignedEvents(coordinatorId);

    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("assigned_coordinator_id", coordinatorId);
    expect(query.eq).toHaveBeenCalledTimes(1);
    expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  // SPM-15 AC01: each assigned event is returned for the coordinator's list.
  it("maps every assigned event into a summary", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [row, { ...row, id: "event-2", title: "Orientation", status: "confirmed", organiser: null }],
        error: null,
      }),
    );

    await expect(listAssignedEvents(coordinatorId)).resolves.toEqual([
      {
        id: "event-1",
        title: "Career Fair",
        purpose: "Connect students with employers",
        status: "planning",
        startsAt: "2099-01-01T02:00:00.000Z",
        endsAt: "2099-01-01T08:00:00.000Z",
        updatedAt: "2098-12-02T02:00:00.000Z",
        submittedAt: "2098-12-01T02:00:00.000Z",
        organiserName: "Jasmine",
      },
      {
        id: "event-2",
        title: "Orientation",
        purpose: "Connect students with employers",
        status: "confirmed",
        startsAt: "2099-01-01T02:00:00.000Z",
        endsAt: "2099-01-01T08:00:00.000Z",
        updatedAt: "2098-12-02T02:00:00.000Z",
        submittedAt: "2098-12-01T02:00:00.000Z",
        organiserName: null,
      },
    ]);
  });

  // SPM-15 AC04: a coordinator with no assigned events gets an empty list, not an error.
  it("returns an empty list when nothing is assigned", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: [], error: null }));

    await expect(listAssignedEvents(coordinatorId)).resolves.toEqual([]);
  });

  it("throws a friendly message when the read fails", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "42501", message: "permission denied" } }),
    );

    await expect(listAssignedEvents(coordinatorId)).rejects.toThrow(
      "We couldn't load your assigned events.",
    );
  });
});
