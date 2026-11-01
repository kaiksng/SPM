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

const EVENT_ID = "c7ceb582-cb27-47df-8dea-e3a9f0c3b676";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";

function authedRequest(body: unknown) {
  return request(server())
    .post(`/events/${EVENT_ID}/cancel`)
    .set("Authorization", "Bearer test-token")
    .send(body as object);
}

describe("POST /events/:eventId/cancel", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it("returns the cancellation result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { eventId: EVENT_ID, status: "cancelled", cancelledAt: "2026-10-20T00:00:00Z" },
      error: null,
    });

    const response = await authedRequest({ reason: "The venue is no longer available." });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("cancelled");
    expect(rpcMock).toHaveBeenCalledWith("cancel_event", {
      p_event_id: EVENT_ID,
      p_reason: "The venue is no longer available.",
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/events/${EVENT_ID}/cancel`)
      .send({ reason: "No longer needed." });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // AC3: a reason is always required.
  it("rejects a blank reason before calling the database", async () => {
    const response = await authedRequest({ reason: "   " });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing reason before calling the database", async () => {
    const response = await authedRequest({});

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // AC1.
  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only the assigned coordinator can cancel this event" },
    });

    const response = await authedRequest({ reason: "Not my event." });

    expect(response.status).toBe(403);
  });

  // AC2.
  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "An event with status completed cannot be cancelled" },
    });

    const response = await authedRequest({ reason: "Too late." });

    expect(response.status).toBe(422);
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await authedRequest({ reason: "Looks fine." });

    expect(response.status).toBe(500);
  });
});
