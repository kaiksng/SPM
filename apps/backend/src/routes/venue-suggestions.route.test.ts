import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppServer } from "../test/app-server";

const { fromMock, rpcMock, getUserMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("../lib/supabase-service-client", () => ({
  getServiceClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
    rpc: rpcMock,
  }),
}));

const { createApp } = await import("../app");
const server = useAppServer(createApp);

const EVENT_ID = "c7ceb582-cb27-47df-8dea-e3a9f0c3b676";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";
const OTHER_USER_ID = "0b0b0b0b-1111-4222-8333-444455556666";

type Row = Record<string, unknown> | null;

/**
 * The route reads `events` and `profiles` with
 * `.from(table).select(...).eq("id", ...).maybeSingle()`. Each table gets its
 * own fake chain so a test can set the event row and the caller's profile
 * independently, and assert which id was looked up.
 */
function givenRows({ event, profile }: { event: Row; profile: Row }) {
  const lookups: Record<string, unknown> = {};
  fromMock.mockImplementation((table: string) => {
    const row = table === "events" ? event : table === "profiles" ? profile : null;
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((_column: string, value: unknown) => {
        lookups[table] = value;
        return chain;
      }),
      maybeSingle: vi.fn(() => Promise.resolve({ data: row, error: null })),
    };
    return chain;
  });
  return lookups;
}

function eventOwnedBy(organiserId: string, assignedCoordinatorId: string | null = null) {
  return { organiser_id: organiserId, assigned_coordinator_id: assignedCoordinatorId };
}

function get(path = `/events/${EVENT_ID}/suggested-venues`) {
  return request(server()).get(path).set("Authorization", "Bearer test-token");
}

const SUGGESTIONS = [{ id: "venue-1", name: "Innovation Hall", availability_status: "available" }];

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset().mockResolvedValue({ data: SUGGESTIONS, error: null });
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("GET /events/:eventId/suggested-venues", () => {
  describe("who may see suggestions (mirrors can_view_event, because the service client bypasses RLS)", () => {
    it("allows the event's organiser", async () => {
      const lookups = givenRows({ event: eventOwnedBy(USER_ID), profile: { role: "event_organiser" } });

      const response = await get();

      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(SUGGESTIONS);
      expect(lookups).toEqual({ events: EVENT_ID, profiles: USER_ID });
      expect(rpcMock).toHaveBeenCalledWith("find_matching_venues", { p_event_id: EVENT_ID });
    });

    it("allows the event's assigned coordinator", async () => {
      givenRows({ event: eventOwnedBy(OTHER_USER_ID, USER_ID), profile: { role: "event_coordinator" } });

      const response = await get();

      expect(response.status).toBe(200);
      expect(rpcMock).toHaveBeenCalledTimes(1);
    });

    // Same roles as can_view_event (event_coordinator_lead since 202610050002).
    it.each(["event_coordinator", "venue_staff", "technical_support_staff", "event_coordinator_lead"])(
      "allows internal staff role %s on someone else's event",
      async (role) => {
        givenRows({ event: eventOwnedBy(OTHER_USER_ID), profile: { role } });

        const response = await get();

        expect(response.status).toBe(200);
        expect(rpcMock).toHaveBeenCalledTimes(1);
      },
    );

    it.each([
      ["another organiser", { role: "event_organiser" }],
      ["an attendee", { role: "attendee" }],
      ["a safety officer", { role: "safety_officer" }],
      ["a caller with no profile", null],
    ])("refuses %s on someone else's event without running the match", async (_label, profile) => {
      givenRows({ event: eventOwnedBy(OTHER_USER_ID, OTHER_USER_ID), profile });

      const response = await get();

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Event not found or you do not have access to it");
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it("answers a missing event with the same 403, so it doesn't reveal whether the event exists", async () => {
      givenRows({ event: null, profile: { role: "venue_staff" } });

      const response = await get();

      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Event not found or you do not have access to it");
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server()).get(`/events/${EVENT_ID}/suggested-venues`);

    expect(response.status).toBe(401);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid event id before reading anything", async () => {
    const response = await get("/events/not-a-uuid/suggested-venues");

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Enter a valid event id");
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 from find_matching_venues to a 403", async () => {
    givenRows({ event: eventOwnedBy(USER_ID), profile: { role: "event_organiser" } });
    rpcMock.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });

    const response = await get();

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("permission denied");
  });

  it("returns a 500 for an unexpected database error", async () => {
    givenRows({ event: eventOwnedBy(USER_ID), profile: { role: "event_organiser" } });
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "connection reset" } });

    const response = await get();

    expect(response.status).toBe(500);
  });
});
