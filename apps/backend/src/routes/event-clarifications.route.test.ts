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
const CLARIFICATION_ID = "9c6e9f0a-2f0d-4a3d-8f0a-2f0d4a3d8f0a";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";

beforeEach(() => {
  rpcMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("POST /events/:eventId/clarifications", () => {
  function authedRequest(body: object) {
    return request(server())
      .post(`/events/${EVENT_ID}/clarifications`)
      .set("Authorization", "Bearer test-token")
      .send(body);
  }

  it("returns the request result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: CLARIFICATION_ID, requestedAt: "2026-09-14T00:00:00Z" },
      error: null,
    });

    const response = await authedRequest({
      question: "What is the exact budget breakdown?",
      permittedFields: ["purpose"],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(CLARIFICATION_ID);
    expect(rpcMock).toHaveBeenCalledWith("request_event_clarification", {
      p_event_id: EVENT_ID,
      p_question: "What is the exact budget breakdown?",
      p_permitted_fields: ["purpose"],
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/events/${EVENT_ID}/clarifications`)
      .send({ question: "Why?", permittedFields: [] });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a blank question before calling the database", async () => {
    const response = await authedRequest({ question: "  ", permittedFields: [] });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an unrecognised permitted field before calling the database", async () => {
    const response = await authedRequest({
      question: "Why?",
      permittedFields: ["notAField"],
    });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the assigned coordinator can request clarification for this event",
      },
    });

    const response = await authedRequest({ question: "Why?", permittedFields: [] });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(
      "Only the assigned coordinator can request clarification for this event",
    );
  });

  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "A clarification is already open for this event" },
    });

    const response = await authedRequest({ question: "Why?", permittedFields: [] });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("A clarification is already open for this event");
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await authedRequest({ question: "Why?", permittedFields: [] });

    expect(response.status).toBe(500);
  });
});

describe("POST /clarifications/:clarificationId/respond", () => {
  function authedRequest(body: object) {
    return request(server())
      .post(`/clarifications/${CLARIFICATION_ID}/respond`)
      .set("Authorization", "Bearer test-token")
      .send(body);
  }

  it("returns the response result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: CLARIFICATION_ID, respondedAt: "2026-09-14T00:00:00Z" },
      error: null,
    });

    const response = await authedRequest({ response: "Here is the answer." });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("respond_event_clarification", {
      p_clarification_id: CLARIFICATION_ID,
      p_response: "Here is the answer.",
      p_actor_id: USER_ID,
    });
  });

  it("rejects a blank response before calling the database", async () => {
    const response = await authedRequest({ response: "   " });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the event organiser can respond to this clarification",
      },
    });

    const response = await authedRequest({ response: "Here is the answer." });

    expect(response.status).toBe(403);
  });
});

describe("POST /clarifications/:clarificationId/resolve", () => {
  it("returns the resolution result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: CLARIFICATION_ID, resolvedAt: "2026-09-14T00:00:00Z" },
      error: null,
    });

    const response = await request(server())
      .post(`/clarifications/${CLARIFICATION_ID}/resolve`)
      .set("Authorization", "Bearer test-token")
      .send();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("resolve_event_clarification", {
      p_clarification_id: CLARIFICATION_ID,
      p_actor_id: USER_ID,
    });
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the assigned coordinator can resolve this clarification",
      },
    });

    const response = await request(server())
      .post(`/clarifications/${CLARIFICATION_ID}/resolve`)
      .set("Authorization", "Bearer test-token")
      .send();

    expect(response.status).toBe(403);
  });

  it("rejects an invalid clarification id before calling the database", async () => {
    const response = await request(server())
      .post("/clarifications/not-a-uuid/resolve")
      .set("Authorization", "Bearer test-token")
      .send();

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
