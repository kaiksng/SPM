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
    .post(`/events/${EVENT_ID}/decide`)
    .set("Authorization", "Bearer test-token")
    .send(body as object);
}

describe("POST /events/:eventId/decide", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it("returns the decision result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { eventId: EVENT_ID, status: "approved", decidedAt: "2026-09-14T00:00:00Z" },
      error: null,
    });

    const response = await authedRequest({
      decision: "approved",
      rationale: "Everything checks out.",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("approved");
    expect(rpcMock).toHaveBeenCalledWith("decide_event_request", {
      p_event_id: EVENT_ID,
      p_decision: "approved",
      p_rationale: "Everything checks out.",
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/events/${EVENT_ID}/decide`)
      .send({ decision: "approved", rationale: "Fine." });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a blank rationale for a rejection before calling the database", async () => {
    const response = await authedRequest({ decision: "rejected", rationale: "   " });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // AC03: approval does not require a rationale.
  it("allows a blank rationale for an approval", async () => {
    rpcMock.mockResolvedValue({
      data: { eventId: EVENT_ID, status: "planning", decidedAt: "2026-09-14T00:00:00Z" },
      error: null,
    });

    const response = await authedRequest({ decision: "approved", rationale: "" });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("decide_event_request", {
      p_event_id: EVENT_ID,
      p_decision: "approved",
      p_rationale: "",
      p_actor_id: USER_ID,
    });
  });

  it("rejects an unrecognised decision value before calling the database", async () => {
    const response = await authedRequest({ decision: "maybe", rationale: "Unsure." });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the assigned coordinator can decide this event request",
      },
    });

    const response = await authedRequest({ decision: "rejected", rationale: "Not ready." });

    expect(response.status).toBe(403);
  });

  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message:
          "This event has an unresolved clarification and cannot be approved or rejected until it is closed",
      },
    });

    const response = await authedRequest({ decision: "approved", rationale: "Looks fine." });

    expect(response.status).toBe(422);
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await authedRequest({ decision: "approved", rationale: "Looks fine." });

    expect(response.status).toBe(500);
  });
});
