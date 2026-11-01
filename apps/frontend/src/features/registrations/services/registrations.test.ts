import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
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
  listEventRegistrations,
  listMyRegistrations,
  loadRegistrationCounts,
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

  // 202611010007: an event-cancelled row reports what the attendee was, for the event page.
  it("returns what the attendee was when the event was cancelled", async () => {
    fromMock.mockReturnValueOnce(
      queryBuilder({ data: { status: "event_cancelled", status_before_cancellation: "waitlisted" }, error: null }),
    );

    await expect(getOwnRegistrationStatus("event-1", "attendee-1")).resolves.toBe("waitlisted");
  });

  // SPM-43 scenario 3: a withdrawn row counts as no registration, so registering again is a new request.
  it("returns null when the attendee's row is withdrawn", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: { status: "withdrawn" }, error: null }));

    await expect(getOwnRegistrationStatus("event-1", "attendee-1")).resolves.toBeNull();
  });
});

// SPM-44: attendees can no longer read other attendees' rows, so counts and
// waiting-list positions come from the event_registration_counts function.
describe("loadRegistrationCounts", () => {
  beforeEach(() => rpcMock.mockReset());

  it("asks the database for the numbers only, for the given events", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { event_id: "event-1", registered_count: 7, own_waitlist_position: null },
        { event_id: "event-2", registered_count: 50, own_waitlist_position: 3 },
      ],
      error: null,
    });

    const counts = await loadRegistrationCounts(["event-1", "event-2"]);

    expect(rpcMock).toHaveBeenCalledWith("event_registration_counts", { p_event_ids: ["event-1", "event-2"] });
    expect(counts.get("event-1")).toEqual({ registeredCount: 7, ownWaitlistPosition: null });
    expect(counts.get("event-2")).toEqual({ registeredCount: 50, ownWaitlistPosition: 3 });
  });

  it("makes no call when there are no events", async () => {
    await expect(loadRegistrationCounts([])).resolves.toEqual(new Map());
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("throws a friendly error when the call fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(loadRegistrationCounts(["event-1"])).rejects.toThrow(
      "We couldn't check this event's registrations.",
    );
  });
});

describe("getRegisteredCount", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it("returns the event's registered count without reading anyone's row", async () => {
    rpcMock.mockResolvedValue({
      data: [{ event_id: "event-1", registered_count: 7, own_waitlist_position: null }],
      error: null,
    });

    await expect(getRegisteredCount("event-1")).resolves.toBe(7);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("defaults to 0 when the event is not returned", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(getRegisteredCount("event-1")).resolves.toBe(0);
  });

  it("throws the capacity message when the count cannot be read", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(getRegisteredCount("event-1")).rejects.toThrow("We couldn't check this event's capacity.");
  });
});

describe("getWaitlistPosition", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it("returns the signed-in attendee's own 1-based position", async () => {
    rpcMock.mockResolvedValue({
      data: [{ event_id: "event-1", registered_count: 50, own_waitlist_position: 2 }],
      error: null,
    });

    await expect(getWaitlistPosition("event-1")).resolves.toBe(2);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns null when the attendee isn't on the waiting list", async () => {
    rpcMock.mockResolvedValue({
      data: [{ event_id: "event-1", registered_count: 50, own_waitlist_position: null }],
      error: null,
    });

    await expect(getWaitlistPosition("event-1")).resolves.toBeNull();
  });
});

describe("listMyRegistrations", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  const visibleEvent = (overrides: Record<string, unknown> = {}) => ({
    id: "event-1",
    title: "Robotics Showcase",
    description: null,
    starts_at: "2026-11-28T03:00:00Z",
    ends_at: "2026-11-28T07:00:00Z",
    status: "confirmed",
    banner_path: null,
    organiser_name: null,
    preferred_location: "Exhibition Hall",
    registration_required: true,
    registration_opens_at: null,
    registration_closes_at: null,
    attendee_capacity: 50,
    waitlist_enabled: false,
    withdrawal_permitted: true,
    ...overrides,
  });

  /** Registration rows come from event_registrations; events come from attendee_visible_events. */
  function given(rows: unknown[], events: unknown[], counts: unknown[] = []) {
    const query = queryBuilder({ data: rows, error: null });
    fromMock.mockReturnValue(query);
    rpcMock.mockImplementation(async (name: string) =>
      name === "attendee_visible_events" ? { data: events, error: null } : { data: counts, error: null },
    );
    return query;
  }

  it("maps each row's event into a flat registration summary, filtered to this attendee", async () => {
    const query = given(
      [{ id: "reg-1", event_id: "event-1", status: "registered", registered_at: "2026-11-01T00:00:00Z", status_before_cancellation: null }],
      [visibleEvent()],
    );

    await expect(listMyRegistrations("attendee-1")).resolves.toEqual([
      {
        id: "reg-1",
        eventId: "event-1",
        title: "Robotics Showcase",
        startsAt: "2026-11-28T03:00:00Z",
        endsAt: "2026-11-28T07:00:00Z",
        location: "Exhibition Hall",
        status: "registered",
        statusBeforeCancellation: null,
        registeredAt: "2026-11-01T00:00:00Z",
        waitlistPosition: null,
        withdrawalPermitted: true,
      },
    ]);
    // Keeps it "my registrations" for any signed-in user, including an
    // organiser or coordinator who can also read the rows of events they manage.
    expect(query.eq).toHaveBeenCalledWith("attendee_id", "attendee-1");
    // SPM-49: events come from the attendee RPC, never the events table.
    expect(fromMock).not.toHaveBeenCalledWith("events");
    expect(rpcMock).toHaveBeenCalledWith("attendee_visible_events", { p_event_ids: ["event-1"] });
  });

  it("skips a row whose event is no longer visible", async () => {
    given([{ id: "reg-1", event_id: "event-1", status: "registered", registered_at: "2026-11-01T00:00:00Z" }], []);

    await expect(listMyRegistrations("attendee-1")).resolves.toEqual([]);
  });

  it("includes the attendee's waiting-list position for a waitlisted row", async () => {
    given(
      [{ id: "reg-1", event_id: "event-1", status: "waitlisted", registered_at: "2026-11-01T00:00:00Z" }],
      [visibleEvent({ title: "Career Fair", preferred_location: null, withdrawal_permitted: null })],
      [{ event_id: "event-1", registered_count: 20, own_waitlist_position: 2 }],
    );

    const result = await listMyRegistrations("attendee-1");

    expect(result[0]?.waitlistPosition).toBe(2);
    expect(result[0]).toMatchObject({ location: null, withdrawalPermitted: false });
    // SPM-44: the position comes from the counts function, not other attendees' rows.
    expect(rpcMock).toHaveBeenCalledWith("event_registration_counts", { p_event_ids: ["event-1"] });
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("throws a friendly error when the events cannot be loaded", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [{ id: "reg-1", event_id: "event-1", status: "registered", registered_at: "2026-11-01T00:00:00Z" }],
        error: null,
      }),
    );
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(listMyRegistrations("attendee-1")).rejects.toThrow("We couldn't load your registrations.");
  });
});

describe("listEventRegistrations", () => {
  beforeEach(() => fromMock.mockReset());

  // SPM-44 AC04: attendee name, status and registration time, for one event.
  it("maps each row including the attendee's name, scoped to the given event", async () => {
    const query = queryBuilder({
      data: [
        {
          id: "reg-1",
          attendee_id: "attendee-1",
          status: "registered",
          registered_at: "2026-11-01T00:00:00Z",
          withdrawn_at: null,
          attendee: { full_name: "Avery Attendee" },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(query);

    await expect(listEventRegistrations("event-1")).resolves.toEqual([
      {
        id: "reg-1",
        attendeeId: "attendee-1",
        attendeeName: "Avery Attendee",
        status: "registered",
        registeredAt: "2026-11-01T00:00:00Z",
        withdrawnAt: null,
        waitlistPosition: null,
      },
    ]);
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
  });

  // SPM-44 AC04: waiting-list position where applicable.
  it("numbers waitlisted rows by registration order, 1-based", async () => {
    fromMock.mockReturnValueOnce(
      queryBuilder({
        data: [
          {
            id: "reg-1",
            attendee_id: "attendee-1",
            status: "waitlisted",
            registered_at: "2026-11-01T00:00:00Z",
            withdrawn_at: null,
            attendee: { full_name: "First Waiter" },
          },
          {
            id: "reg-2",
            attendee_id: "attendee-2",
            status: "waitlisted",
            registered_at: "2026-11-02T00:00:00Z",
            withdrawn_at: null,
            attendee: { full_name: "Second Waiter" },
          },
        ],
        error: null,
      }),
    );

    const result = await listEventRegistrations("event-1");

    expect(result[0]?.waitlistPosition).toBe(1);
    expect(result[1]?.waitlistPosition).toBe(2);
  });

  it("falls back to null when the attendee's profile isn't joined", async () => {
    fromMock.mockReturnValueOnce(
      queryBuilder({
        data: [
          {
            id: "reg-1",
            attendee_id: "attendee-1",
            status: "withdrawn",
            registered_at: "2026-11-01T00:00:00Z",
            withdrawn_at: "2026-11-05T00:00:00Z",
            attendee: null,
          },
        ],
        error: null,
      }),
    );

    const result = await listEventRegistrations("event-1");

    expect(result[0]?.attendeeName).toBeNull();
    expect(result[0]?.waitlistPosition).toBeNull();
  });

  it("throws a friendly error when the query fails", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listEventRegistrations("event-1")).rejects.toThrow(
      "We couldn't load this event's registrations.",
    );
  });
});
