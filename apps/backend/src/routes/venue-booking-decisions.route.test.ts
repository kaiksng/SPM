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

function authedRequest(body: unknown) {
  return request(server())
    .post(`/venue-bookings/${BOOKING_ID}/decide`)
    .set("Authorization", "Bearer test-token")
    .send(body as object);
}

describe("POST /venue-bookings/:bookingId/decide", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it("returns the decision result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { bookingId: BOOKING_ID, status: "approved", decidedAt: "2026-09-27T00:00:00Z" },
      error: null,
    });

    const response = await authedRequest({
      decision: "approved",
      reason: "",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("approved");
    expect(rpcMock).toHaveBeenCalledWith("decide_venue_booking_request", {
      p_booking_id: BOOKING_ID,
      p_decision: "approved",
      p_reason: "",
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/venue-bookings/${BOOKING_ID}/decide`)
      .send({ decision: "approved", reason: "" });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // SPM-82: approving or rejecting a replacement names the booking by id; a malformed id never reaches the database.
  it("rejects a booking id that is not valid before calling the database", async () => {
    const response = await request(server())
      .post("/venue-bookings/not-a-booking/decide")
      .set("Authorization", "Bearer test-token")
      .send({ decision: "approved", reason: "" });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a blank reason for a rejection before calling the database", async () => {
    const response = await authedRequest({ decision: "rejected", reason: "   " });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("allows a blank reason for an approval", async () => {
    rpcMock.mockResolvedValue({
      data: { bookingId: BOOKING_ID, status: "approved", decidedAt: "2026-09-27T00:00:00Z" },
      error: null,
    });

    const response = await authedRequest({ decision: "approved", reason: "" });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("decide_venue_booking_request", {
      p_booking_id: BOOKING_ID,
      p_decision: "approved",
      p_reason: "",
      p_actor_id: USER_ID,
    });
  });

  it("rejects an unrecognised decision value before calling the database", async () => {
    const response = await authedRequest({ decision: "maybe", reason: "Unsure." });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only Venue Staff can decide a venue booking request",
      },
    });

    const response = await authedRequest({ decision: "rejected", reason: "Not ready." });

    expect(response.status).toBe(403);
  });

  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "Only a Pending venue booking request can be approved or rejected",
      },
    });

    const response = await authedRequest({ decision: "approved", reason: "" });

    expect(response.status).toBe(422);
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await authedRequest({ decision: "approved", reason: "" });

    expect(response.status).toBe(500);
  });
});
