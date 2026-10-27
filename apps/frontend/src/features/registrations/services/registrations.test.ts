import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import {
  getOwnRegistrationStatus,
  getRegisteredCount,
  getWaitlistPosition,
  joinWaitlist,
  leaveWaitlist,
  listMyRegistrations,
  registerForEvent,
  withdrawRegistration,
} from "./registrations";

describe("registerForEvent", () => {
  it("posts to the backend register route", async () => {
    apiFetchMock.mockResolvedValue({ data: { status: "registered" } });

    await registerForEvent("event-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/register", { method: "POST" });
  });
});

describe("joinWaitlist", () => {
  it("posts to the backend waitlist route", async () => {
    apiFetchMock.mockResolvedValue({ data: { status: "waitlisted" } });

    await joinWaitlist("event-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/waitlist", { method: "POST" });
  });
});

describe("leaveWaitlist", () => {
  it("deletes against the backend waitlist route", async () => {
    apiFetchMock.mockResolvedValue({ data: null });

    await leaveWaitlist("event-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/waitlist", { method: "DELETE" });
  });
});

describe("withdrawRegistration", () => {
  it("posts to the backend withdraw route with no reason", async () => {
    apiFetchMock.mockResolvedValue({ data: null });

    await withdrawRegistration("event-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/withdraw", {
      method: "POST",
      body: JSON.stringify({ reason: undefined }),
    });
  });

  // This story: the reason is optional but is sent through when given.
  it("posts a given reason", async () => {
    apiFetchMock.mockResolvedValue({ data: null });

    await withdrawRegistration("event-1", "Can no longer attend.");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/withdraw", {
      method: "POST",
      body: JSON.stringify({ reason: "Can no longer attend." }),
    });
  });
});

describe("getOwnRegistrationStatus", () => {
  beforeEach(() => fromMock.mockReset());

  it("returns the attendee's status when a row exists", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: { status: "registered" }, error: null }));

    await expect(getOwnRegistrationStatus("event-1", "attendee-1")).resolves.toBe("registered");
  });

  it("returns null when the attendee has no registration", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: null }));

    await expect(getOwnRegistrationStatus("event-1", "attendee-1")).resolves.toBeNull();
  });

  it("returns null when the attendee's row is withdrawn", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: { status: "withdrawn" }, error: null }));

    await expect(getOwnRegistrationStatus("event-1", "attendee-1")).resolves.toBeNull();
  });
});

describe("getRegisteredCount", () => {
  beforeEach(() => fromMock.mockReset());

  it("returns the count from the query", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: null, count: 7 } as never));

    await expect(getRegisteredCount("event-1")).resolves.toBe(7);
  });

  it("defaults to 0 when count is null", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: null, count: null } as never));

    await expect(getRegisteredCount("event-1")).resolves.toBe(0);
  });
});

describe("getWaitlistPosition", () => {
  beforeEach(() => fromMock.mockReset());

  it("returns the 1-based position among waitlisted rows, oldest first", async () => {
    fromMock.mockReturnValueOnce(
      queryBuilder({
        data: [
          { attendee_id: "someone-else" },
          { attendee_id: "attendee-1" },
          { attendee_id: "another" },
        ],
        error: null,
      }),
    );

    await expect(getWaitlistPosition("event-1", "attendee-1")).resolves.toBe(2);
  });

  it("returns null when the attendee isn't on the waiting list", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: [], error: null }));

    await expect(getWaitlistPosition("event-1", "attendee-1")).resolves.toBeNull();
  });
});

describe("listMyRegistrations", () => {
  beforeEach(() => fromMock.mockReset());

  it("maps each row's event into a flat registration summary, filtered to this attendee", async () => {
    const query = queryBuilder({
      data: [
        {
          id: "reg-1",
          status: "registered",
          registered_at: "2026-11-01T00:00:00Z",
          event: {
            id: "event-1",
            title: "Robotics Showcase",
            starts_at: "2026-11-28T03:00:00Z",
            ends_at: "2026-11-28T07:00:00Z",
            event_venue_requirements: { preferred_location: "Exhibition Hall" },
            event_registration_requirements: { withdrawal_permitted: true },
          },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(query);

    await expect(listMyRegistrations("attendee-1")).resolves.toEqual([
      {
        id: "reg-1",
        eventId: "event-1",
        title: "Robotics Showcase",
        startsAt: "2026-11-28T03:00:00Z",
        endsAt: "2026-11-28T07:00:00Z",
        location: "Exhibition Hall",
        status: "registered",
        registeredAt: "2026-11-01T00:00:00Z",
        waitlistPosition: null,
        withdrawalPermitted: true,
      },
    ]);
    // Guards against relying solely on RLS, which also grants any attendee
    // read access to other attendees' rows on a confirmed event.
    expect(query.eq).toHaveBeenCalledWith("attendee_id", "attendee-1");
  });

  it("skips a row whose event is no longer visible", async () => {
    fromMock.mockReturnValueOnce(
      queryBuilder({
        data: [
          {
            id: "reg-1",
            status: "registered",
            registered_at: "2026-11-01T00:00:00Z",
            event: null,
          },
        ],
        error: null,
      }),
    );

    await expect(listMyRegistrations("attendee-1")).resolves.toEqual([]);
  });

  it("includes the attendee's waiting-list position for a waitlisted row", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            {
              id: "reg-1",
              status: "waitlisted",
              registered_at: "2026-11-01T00:00:00Z",
              event: {
                id: "event-1",
                title: "Career Fair",
                starts_at: "2026-11-20T01:00:00Z",
                ends_at: "2026-11-20T09:00:00Z",
                event_venue_requirements: null,
              },
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            { event_id: "event-1", attendee_id: "someone-else" },
            { event_id: "event-1", attendee_id: "attendee-1" },
          ],
          error: null,
        }),
      );

    const result = await listMyRegistrations("attendee-1");

    expect(result[0]?.waitlistPosition).toBe(2);
  });
});
