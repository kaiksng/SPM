import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { listEventRequests } from "./event-drafts";

const organiserId = "10000000-0000-0000-0000-000000000001";

const row = {
  id: "event-1",
  title: "Career Fair",
  purpose: "Connect students with employers",
  status: "planning",
  starts_at: "2099-01-01T02:00:00.000Z",
  ends_at: "2099-01-01T08:00:00.000Z",
  updated_at: "2098-12-02T02:00:00.000Z",
  submitted_at: "2098-12-01T02:00:00.000Z",
  assigned_coordinator_id: "coordinator-1",
  assigned_coordinator: { full_name: "Joyce" },
};

beforeEach(() => {
  fromMock.mockReset();
});

describe("listEventRequests", () => {
  // SPM-14 AC01: the organiser's list is scoped to the events they own.
  it("reads only the signed-in organiser's events, newest first", async () => {
    const query = queryBuilder({ data: [row], error: null });
    fromMock.mockReturnValue(query);

    await listEventRequests(organiserId);

    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("organiser_id", organiserId);
    expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  // SPM-14 AC01: each authorised event is returned for the organiser to view.
  it("maps every authorised event into a summary", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          row,
          {
            ...row,
            id: "event-2",
            title: "Orientation",
            status: "draft",
            submitted_at: null,
            assigned_coordinator_id: null,
            assigned_coordinator: null,
          },
        ],
        error: null,
      }),
    );

    await expect(listEventRequests(organiserId)).resolves.toEqual([
      {
        id: "event-1",
        title: "Career Fair",
        purpose: "Connect students with employers",
        status: "planning",
        startsAt: "2099-01-01T02:00:00.000Z",
        endsAt: "2099-01-01T08:00:00.000Z",
        updatedAt: "2098-12-02T02:00:00.000Z",
        submittedAt: "2098-12-01T02:00:00.000Z",
        assignedCoordinatorId: "coordinator-1",
        assignedCoordinatorName: "Joyce",
      },
      {
        id: "event-2",
        title: "Orientation",
        purpose: "Connect students with employers",
        status: "draft",
        startsAt: "2099-01-01T02:00:00.000Z",
        endsAt: "2099-01-01T08:00:00.000Z",
        updatedAt: "2098-12-02T02:00:00.000Z",
        submittedAt: null,
        assignedCoordinatorId: null,
        assignedCoordinatorName: null,
      },
    ]);
  });

  // SPM-14 AC03: a refused read surfaces a plain message, not the raw error.
  it("throws a friendly message when the read fails", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "42501", message: "permission denied" } }),
    );

    await expect(listEventRequests(organiserId)).rejects.toThrow(
      "We couldn't load your event requests.",
    );
  });
});
