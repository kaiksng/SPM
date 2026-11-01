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
const CHANGE_REQUEST_ID = "9c6e9f0a-2f0d-4a3d-8f0a-2f0d4a3d8f0a";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";

beforeEach(() => {
  rpcMock.mockReset();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
});

describe("POST /events/:eventId/change-requests", () => {
  function authedRequest(body: object) {
    return request(server())
      .post(`/events/${EVENT_ID}/change-requests`)
      .set("Authorization", "Bearer test-token")
      .send(body);
  }

  // AC03: describes the change and includes a reason.
  it("returns the request result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: CHANGE_REQUEST_ID, status: "pending" },
      error: null,
    });

    const response = await authedRequest({
      requestedChanges: { startsAt: "2099-01-01T10:00:00+08:00" },
      reason: "Speaker rescheduled",
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("pending");
    expect(rpcMock).toHaveBeenCalledWith("submit_event_change_request", {
      p_event_id: EVENT_ID,
      p_requested_changes: { startsAt: "2099-01-01T10:00:00+08:00" },
      p_reason: "Speaker rescheduled",
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/events/${EVENT_ID}/change-requests`)
      .send({ requestedChanges: { startsAt: "later" }, reason: "A reason" });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a blank reason before calling the database", async () => {
    const response = await authedRequest({
      requestedChanges: { startsAt: "later" },
      reason: "   ",
    });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing requestedChanges payload before calling the database", async () => {
    const response = await authedRequest({ reason: "A reason" });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // AC01: only Requested/Planning/Confirmed/Pending Safety Check are allowed.
  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message:
          "A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event",
      },
    });

    const response = await authedRequest({
      requestedChanges: { startsAt: "later" },
      reason: "A reason",
    });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe(
      "A change request can only be submitted for a Requested, Planning, Confirmed or Pending Safety Check event",
    );
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only the event organiser can submit a change request" },
    });

    const response = await authedRequest({
      requestedChanges: { startsAt: "later" },
      reason: "A reason",
    });

    expect(response.status).toBe(403);
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await authedRequest({
      requestedChanges: { startsAt: "later" },
      reason: "A reason",
    });

    expect(response.status).toBe(500);
  });
});

describe("POST /change-requests/:changeRequestId/decide", () => {
  function authedRequest(body: object) {
    return request(server())
      .post(`/change-requests/${CHANGE_REQUEST_ID}/decide`)
      .set("Authorization", "Bearer test-token")
      .send(body);
  }

  it("returns the decision result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: CHANGE_REQUEST_ID, status: "approved" },
      error: null,
    });

    const response = await authedRequest({
      decision: "approved",
      reviewNotes: "Moving to the afternoon slot",
    });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("decide_event_change_request", {
      p_change_request_id: CHANGE_REQUEST_ID,
      p_decision: "approved",
      p_review_notes: "Moving to the afternoon slot",
      p_actor_id: USER_ID,
    });
  });

  // SPM-39 AC06: a rejection reaches the database with its reason.
  it("passes a rejection and its reason to the database", async () => {
    rpcMock.mockResolvedValue({
      data: { id: CHANGE_REQUEST_ID, status: "rejected" },
      error: null,
    });

    const response = await authedRequest({ decision: "rejected", reviewNotes: "Not enough notice." });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("decide_event_change_request", {
      p_change_request_id: CHANGE_REQUEST_ID,
      p_decision: "rejected",
      p_review_notes: "Not enough notice.",
      p_actor_id: USER_ID,
    });
  });

  // SPM-39 AC05: approval needs implementation notes.
  it("rejects an approval without implementation notes before calling the database", async () => {
    const response = await authedRequest({ decision: "approved", reviewNotes: "   " });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe(
      "Add implementation notes before approving this change request",
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid decision value before calling the database", async () => {
    const response = await authedRequest({ decision: "maybe" });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // SPM-39 AC06: rejection needs a reason.
  it("rejects a rejection without a reason before calling the database", async () => {
    const response = await authedRequest({ decision: "rejected" });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe(
      "Explain the reason for rejecting this change request",
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Only a change request Pending Review can be decided" },
    });

    const response = await authedRequest({ decision: "rejected", reviewNotes: "Not needed" });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Only a change request Pending Review can be decided");
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the assigned coordinator can decide this change request",
      },
    });

    const response = await authedRequest({ decision: "approved", reviewNotes: "Fine" });

    expect(response.status).toBe(403);
  });

  it("rejects an invalid change request id before calling the database", async () => {
    const response = await request(server())
      .post("/change-requests/not-a-uuid/decide")
      .set("Authorization", "Bearer test-token")
      .send({ decision: "approved" });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("POST /change-requests/:changeRequestId/apply", () => {
  const updates = {
    title: "Planning Event",
    startsAt: "2099-01-01T14:00:00+08:00",
    endsAt: "2099-01-01T16:00:00+08:00",
  };

  function authedRequest(body: object) {
    return request(server())
      .post(`/change-requests/${CHANGE_REQUEST_ID}/apply`)
      .set("Authorization", "Bearer test-token")
      .send(body);
  }

  // SPM-39 AC07: the new event details reach the database unchanged.
  it("returns the apply result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { id: CHANGE_REQUEST_ID, status: "implemented", returnedToPlanning: false },
      error: null,
    });

    const response = await authedRequest({ updates });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("implemented");
    expect(rpcMock).toHaveBeenCalledWith("apply_event_change_request", {
      p_change_request_id: CHANGE_REQUEST_ID,
      p_updates: updates,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/change-requests/${CHANGE_REQUEST_ID}/apply`)
      .send({ updates });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing updates payload before calling the database", async () => {
    const response = await authedRequest({});

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid change request id before calling the database", async () => {
    const response = await request(server())
      .post("/change-requests/not-a-uuid/apply")
      .set("Authorization", "Bearer test-token")
      .send({ updates });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Only an Approved change request can be applied" },
    });

    const response = await authedRequest({ updates });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Only an Approved change request can be applied");
  });

  // SPM-39 AC07: only the assigned coordinator applies.
  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only the assigned coordinator can apply this change request" },
    });

    const response = await authedRequest({ updates });

    expect(response.status).toBe(403);
  });
});

describe("POST /change-requests/:changeRequestId/withdraw", () => {
  it("returns the withdrawal result on success", async () => {
    rpcMock.mockResolvedValue({ data: CHANGE_REQUEST_ID, error: null });

    const response = await request(server())
      .post(`/change-requests/${CHANGE_REQUEST_ID}/withdraw`)
      .set("Authorization", "Bearer test-token")
      .send();

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("withdraw_event_change_request", {
      p_change_request_id: CHANGE_REQUEST_ID,
      p_actor_id: USER_ID,
    });
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the organiser who submitted this request can withdraw it",
      },
    });

    const response = await request(server())
      .post(`/change-requests/${CHANGE_REQUEST_ID}/withdraw`)
      .set("Authorization", "Bearer test-token")
      .send();

    expect(response.status).toBe(403);
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/change-requests/${CHANGE_REQUEST_ID}/withdraw`)
      .send();

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
