import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const EVENT_ID = "c7ceb582-cb27-47df-8dea-e3a9f0c3b676";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";

function authedRequest(eventId = EVENT_ID) {
  return request(createApp())
    .post(`/events/${eventId}/register`)
    .set("Authorization", "Bearer test-token")
    .send();
}

describe("POST /events/:eventId/register", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it("returns the new registration on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "reg-1", event_id: EVENT_ID, attendee_id: USER_ID, status: "registered" },
      error: null,
    });

    const response = await authedRequest();

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("registered");
    expect(rpcMock).toHaveBeenCalledWith("register_for_event", {
      p_event_id: EVENT_ID,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(createApp()).post(`/events/${EVENT_ID}/register`).send();

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid event id before calling the database", async () => {
    const response = await authedRequest("not-a-uuid");

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps P0002 (event not found) to a 404", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "Event not found" },
    });

    const response = await authedRequest();

    expect(response.status).toBe(404);
  });

  it("maps 23505 (duplicate registration) to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "You are already registered for this event" },
    });

    const response = await authedRequest();

    expect(response.status).toBe(422);
  });

  it("maps 23514 (business rule, e.g. capacity/window) to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "This event has reached capacity" },
    });

    const response = await authedRequest();

    expect(response.status).toBe(422);
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await authedRequest();

    expect(response.status).toBe(500);
  });
});
