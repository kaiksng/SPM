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

describe("POST /events/:eventId/waitlist", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  function joinRequest(eventId = EVENT_ID) {
    return request(createApp())
      .post(`/events/${eventId}/waitlist`)
      .set("Authorization", "Bearer test-token")
      .send();
  }

  it("returns the new waitlist row on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: "reg-1", event_id: EVENT_ID, attendee_id: USER_ID, status: "waitlisted" },
      error: null,
    });

    const response = await joinRequest();

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("waitlisted");
    expect(rpcMock).toHaveBeenCalledWith("join_event_waitlist", {
      p_event_id: EVENT_ID,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(createApp()).post(`/events/${EVENT_ID}/waitlist`).send();

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 23514 (e.g. not full yet, waitlist disabled) to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "This event has not reached capacity" },
    });

    const response = await joinRequest();

    expect(response.status).toBe(422);
  });
});

describe("DELETE /events/:eventId/waitlist", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  function leaveRequest(eventId = EVENT_ID) {
    return request(createApp())
      .delete(`/events/${eventId}/waitlist`)
      .set("Authorization", "Bearer test-token")
      .send();
  }

  it("succeeds with no body", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const response = await leaveRequest();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("leave_event_waitlist", {
      p_event_id: EVENT_ID,
      p_actor_id: USER_ID,
    });
  });

  it("maps P0002 (not on the waitlist) to a 404", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "P0002", message: "You are not on the waiting list for this event" },
    });

    const response = await leaveRequest();

    expect(response.status).toBe(404);
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(createApp()).delete(`/events/${EVENT_ID}/waitlist`).send();

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("POST /events/:eventId/withdraw", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  function withdrawRequest(body: unknown = undefined, eventId = EVENT_ID) {
    return request(createApp())
      .post(`/events/${eventId}/withdraw`)
      .set("Authorization", "Bearer test-token")
      .send(body as object);
  }

  // SPM-43 AC01: the withdrawal reason is optional.
  it("succeeds with no body, passing an empty reason", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const response = await withdrawRequest();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("withdraw_registration", {
      p_event_id: EVENT_ID,
      p_actor_id: USER_ID,
      p_reason: "",
    });
  });

  // This story: the reason is optional.
  // SPM-43 AC01: an optional reason is recorded with the withdrawal.
  it("passes a given reason through", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    const response = await withdrawRequest({ reason: "Can no longer attend." });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("withdraw_registration", {
      p_event_id: EVENT_ID,
      p_actor_id: USER_ID,
      p_reason: "Can no longer attend.",
    });
  });

  it("rejects a reason that is too long", async () => {
    const response = await withdrawRequest({ reason: "x".repeat(2_001) });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // SPM-43 scenario 2: a withdrawal the organiser does not permit is rejected.
  it("maps 23514 (e.g. withdrawal not permitted) to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Withdrawal is not permitted for this event" },
    });

    const response = await withdrawRequest();

    expect(response.status).toBe(422);
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(createApp()).post(`/events/${EVENT_ID}/withdraw`).send();

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
