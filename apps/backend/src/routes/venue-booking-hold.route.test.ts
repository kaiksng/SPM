import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppServer } from "../test/app-server";

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
const server = useAppServer(createApp);

const BOOKING_ID = "c7ceb582-cb27-47df-8dea-e3a9f0c3b676";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";
// What VenueBookingHoldDialog sends: singaporeLocalToIso("2026-10-20T09:00").
const EXPIRES_AT = "2026-10-20T01:00:00.000Z";

function authedPost(path: string, body?: object) {
  const req = request(server()).post(path).set("Authorization", "Bearer test-token");
  return body ? req.send(body) : req;
}

beforeEach(() => {
  rpcMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("POST /venue-bookings/:bookingId/hold", () => {
  const path = `/venue-bookings/${BOOKING_ID}/hold`;

  it("places the hold as the signed-in Venue Staff member with the given deadline", async () => {
    rpcMock.mockResolvedValue({
      data: { bookingId: BOOKING_ID, status: "on_hold", expiresAt: EXPIRES_AT },
      error: null,
    });

    const response = await authedPost(path, { expiresAt: EXPIRES_AT });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ bookingId: BOOKING_ID, status: "on_hold", expiresAt: EXPIRES_AT });
    expect(rpcMock).toHaveBeenCalledWith("place_venue_booking_hold", {
      p_booking_id: BOOKING_ID,
      p_expires_at: EXPIRES_AT,
      p_actor_id: USER_ID,
    });
  });

  it("accepts a deadline written with a +08:00 offset", async () => {
    rpcMock.mockResolvedValue({ data: {}, error: null });

    const response = await authedPost(path, { expiresAt: "2026-10-20T09:00:00+08:00" });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith(
      "place_venue_booking_hold",
      expect.objectContaining({ p_expires_at: "2026-10-20T09:00:00+08:00" }),
    );
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server()).post(path).send({ expiresAt: EXPIRES_AT });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid booking id before calling the database", async () => {
    const response = await authedPost("/venue-bookings/not-a-uuid/hold", { expiresAt: EXPIRES_AT });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Enter a valid venue booking request id");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no body", undefined],
    ["no expiresAt", { reason: "later" }],
    ["a deadline that is not a date", { expiresAt: "next Tuesday" }],
    ["a deadline without a time zone", { expiresAt: "2026-10-20T09:00" }],
    ["a deadline that is not a string", { expiresAt: 1_790_000_000 }],
  ])("rejects %s before calling the database", async (_label, body) => {
    const response = await authedPost(path, body);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Enter an expiry date and time in the future");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 (not Venue Staff, or not a Pending request) to a 403 with the database's message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only venue staff can place a venue booking request on hold" },
    });

    const response = await authedPost(path, { expiresAt: EXPIRES_AT });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Only venue staff can place a venue booking request on hold");
  });

  // The "in the future, before the requested period starts" rule lives in
  // place_venue_booking_hold, so its message must reach the dialog intact.
  it("maps 23514 (deadline breaks the hold rules) to a 422 with the database's message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "The hold must expire before the requested period starts" },
    });

    const response = await authedPost(path, { expiresAt: EXPIRES_AT });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("The hold must expire before the requested period starts");
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "connection reset" } });

    const response = await authedPost(path, { expiresAt: EXPIRES_AT });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Internal server error");
  });
});

describe("POST /venue-bookings/:bookingId/confirm-hold", () => {
  const path = `/venue-bookings/${BOOKING_ID}/confirm-hold`;

  it("confirms the hold as the signed-in coordinator", async () => {
    rpcMock.mockResolvedValue({ data: { bookingId: BOOKING_ID, status: "pending" }, error: null });

    const response = await authedPost(path);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ bookingId: BOOKING_ID, status: "pending" });
    expect(rpcMock).toHaveBeenCalledWith("confirm_venue_booking_hold", {
      p_booking_id: BOOKING_ID,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server()).post(path);

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid booking id before calling the database", async () => {
    const response = await authedPost("/venue-bookings/not-a-uuid/confirm-hold");

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 (not the requesting coordinator) to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only the requesting coordinator can confirm this hold" },
    });

    const response = await authedPost(path);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("Only the requesting coordinator can confirm this hold");
  });

  it("maps 23514 (hold already expired) to a 422 with the database's message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "This hold has expired and can no longer be confirmed" },
    });

    const response = await authedPost(path);

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("This hold has expired and can no longer be confirmed");
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "connection reset" } });

    const response = await authedPost(path);

    expect(response.status).toBe(500);
  });
});
