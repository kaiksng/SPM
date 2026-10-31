import { createServer, type Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, getUserMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock("../lib/supabase-service-client", () => ({
  getServiceClient: () => ({
    auth: { getUser: getUserMock },
    rpc: rpcMock,
  }),
}));

const { createApp } = await import("../app");

const VENUE_ID = "6f1c2a4e-3b5d-4c7e-9f8a-1b2c3d4e5f60";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";

let server: Server;

beforeAll(async () => {
  server = createServer(createApp());
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
});

function authedPost(path: string, body?: object) {
  const req = request(server).post(path).set("Authorization", "Bearer test-token");
  return body ? req.send(body) : req;
}

beforeEach(() => {
  rpcMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("POST /venues/:venueId/recheck-conflicts", () => {
  const path = `/venues/${VENUE_ID}/recheck-conflicts`;

  it("re-checks one venue as the signed-in user and returns the counts", async () => {
    rpcMock.mockResolvedValue({
      data: { venueId: VENUE_ID, flaggedCount: 2, clearedCount: 1, activeCount: 3 },
      error: null,
    });

    const response = await authedPost(path);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      venueId: VENUE_ID,
      flaggedCount: 2,
      clearedCount: 1,
      activeCount: 3,
    });
    expect(rpcMock).toHaveBeenCalledWith("recheck_venue_conflicts", {
      p_venue_id: VENUE_ID,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server).post(path);

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid venue id before calling the database", async () => {
    const response = await authedPost("/venues/not-a-uuid/recheck-conflicts");

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 (not Venue Staff) to a 403 with the database's message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only venue staff can re-check venue conflicts" },
    });

    const response = await authedPost(path);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Only venue staff can re-check venue conflicts");
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "connection reset" } });

    const response = await authedPost(path);

    expect(response.status).toBe(500);
  });
});

describe("POST /venues/recheck-conflicts (all venues)", () => {
  const path = "/venues/recheck-conflicts";

  it("re-checks every venue as the signed-in user and returns the counts", async () => {
    rpcMock.mockResolvedValue({ data: { flaggedCount: 4, clearedCount: 2 }, error: null });

    const response = await authedPost(path);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ flaggedCount: 4, clearedCount: 2 });
    expect(rpcMock).toHaveBeenCalledWith("recheck_all_venue_conflicts", { p_actor_id: USER_ID });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server).post(path);

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 (not Venue Staff) to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only venue staff can re-check venue conflicts" },
    });

    const response = await authedPost(path);

    expect(response.status).toBe(403);
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "connection reset" } });

    const response = await authedPost(path);

    expect(response.status).toBe(500);
  });
});

// update_venue re-checks conflicts when setup/turnaround time changes and
// reports how many bookings it newly flagged.
describe("POST /venues/:venueId/update", () => {
  const path = `/venues/${VENUE_ID}/update`;
  const venue = { name: "Innovation Hall", setup_time_minutes: 30, turnaround_time_minutes: 15 };

  it("updates the venue as the signed-in user and returns the flagged-booking count", async () => {
    rpcMock.mockResolvedValue({ data: { venueId: VENUE_ID, flaggedBookingsCount: 2 }, error: null });

    const response = await authedPost(path, { venue });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ venueId: VENUE_ID, flaggedBookingsCount: 2 });
    expect(rpcMock).toHaveBeenCalledWith("update_venue", {
      p_venue_id: VENUE_ID,
      p_venue: venue,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server).post(path).send({ venue });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid venue id before calling the database", async () => {
    const response = await authedPost("/venues/not-a-uuid/update", { venue });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", undefined],
    ["a body without venue", { name: "Hall" }],
    ["a venue that is not an object", { venue: "Hall" }],
  ])("rejects %s before calling the database", async (_label, body) => {
    const response = await authedPost(path, body);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Enter the venue details");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 23505 with a field issue to a 422 on that field", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23505",
        message: "duplicate key",
        details: JSON.stringify({ field: "name", message: "A venue with this name already exists at this location" }),
      },
    });

    const response = await authedPost(path, { venue });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({
      error: "A venue with this name already exists at this location",
      fields: [{ field: "name", message: "A venue with this name already exists at this location" }],
    });
  });

  it("maps 23514 with an issue list to a 422 listing every field", async () => {
    const issues = [{ field: "setupTimeMinutes", message: "Setup time must be 0 or more minutes" }];
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "check violation", details: JSON.stringify(issues) },
    });

    const response = await authedPost(path, { venue });

    expect(response.status).toBe(422);
    expect(response.body).toEqual({ error: "Check the highlighted fields and try again.", fields: issues });
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only venue staff can manage venues" },
    });

    const response = await authedPost(path, { venue });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Only venue staff can manage venues");
  });

  it("explains a custom room layout the database does not know yet (22P02)", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "22P02", message: 'invalid input value for enum room_layout: "U-shape"' },
    });

    const response = await authedPost(path, { venue });

    expect(response.status).toBe(422);
    expect(response.body.error).toMatch(/Custom room layouts are not available yet/);
  });

  it.each([
    ["23505 without usable details", { code: "23505", message: "duplicate key", details: "not json" }],
    ["23514 without an issue list", { code: "23514", message: "check violation", details: JSON.stringify({ field: "x" }) }],
    ["22P02 unrelated to room layouts", { code: "22P02", message: "invalid input syntax for type uuid" }],
    ["an unexpected error", { code: "XX000", message: "connection reset" }],
  ])("returns a 500 for %s", async (_label, error) => {
    rpcMock.mockResolvedValue({ data: null, error });

    const response = await authedPost(path, { venue });

    expect(response.status).toBe(500);
  });
});
