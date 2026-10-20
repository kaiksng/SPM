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
const REQUIREMENT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function authedRequest() {
  return request(createApp())
    .post(`/events/${EVENT_ID}/submit-safety-check`)
    .set("Authorization", "Bearer test-token");
}

describe("POST /events/:eventId/submit-safety-check", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  // AC05.
  it("returns the submission result on success", async () => {
    rpcMock.mockResolvedValue({
      data: { eventId: EVENT_ID, status: "pending_safety_check", round: 1 },
      error: null,
    });

    const response = await authedRequest();

    expect(response.status).toBe(200);
    expect(response.body.data.round).toBe(1);
    expect(rpcMock).toHaveBeenCalledWith("submit_event_for_safety_check", {
      p_event_id: EVENT_ID,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(createApp()).post(`/events/${EVENT_ID}/submit-safety-check`);

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid event id before calling the database", async () => {
    const response = await request(createApp())
      .post("/events/not-a-uuid/submit-safety-check")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // insufficient_privilege: not the assigned coordinator, or not Planning.
  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the assigned coordinator can submit this event for the safety check",
      },
    });

    const response = await authedRequest();

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(
      "Only the assigned coordinator can submit this event for the safety check",
    );
  });

  // AC05: every outstanding item is returned, not just the first.
  it("maps 23514 to a 422 carrying every outstanding item", async () => {
    const items = [
      { code: "main_venue_not_ready", message: "The main venue booking (Hall) must be Approved and unflagged." },
      { code: "equipment_not_reserved", message: "Mic is not yet fully reserved." },
    ];
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "This event is not ready for the safety check",
        details: JSON.stringify(items),
      },
    });

    const response = await authedRequest();

    expect(response.status).toBe(422);
    expect(response.body.fields).toEqual(items);
  });

  it("returns a generic 422 when the failure detail cannot be parsed", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Only a Planning event can be submitted for the safety check" },
    });

    const response = await authedRequest();

    expect(response.status).toBe(422);
    expect(response.body.fields).toBeUndefined();
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

describe("POST /events/:eventId/safety-check-decision", () => {
  function decisionRequest(body: unknown) {
    return request(createApp())
      .post(`/events/${EVENT_ID}/safety-check-decision`)
      .set("Authorization", "Bearer test-token")
      .send(body as object);
  }

  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  // AC1/AC2/AC7.
  it("submits Request Changes with the given flagged ids", async () => {
    rpcMock.mockResolvedValue({
      data: {
        eventId: EVENT_ID,
        status: "planning",
        outcome: "changes_requested",
        flaggedBookingCount: 0,
        flaggedRequirementCount: 1,
      },
      error: null,
    });

    const response = await decisionRequest({
      decision: "changes_requested",
      reason: "Reposition away from the exit.",
      flaggedBookingIds: [],
      flaggedRequirementIds: [REQUIREMENT_ID],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.outcome).toBe("changes_requested");
    expect(rpcMock).toHaveBeenCalledWith("decide_event_safety_check", {
      p_event_id: EVENT_ID,
      p_decision: "changes_requested",
      p_reason: "Reposition away from the exit.",
      p_flagged_booking_ids: [],
      p_flagged_requirement_ids: [REQUIREMENT_ID],
      p_actor_id: USER_ID,
    });
  });

  // AC1/AC3/AC4.
  it("submits Reject with no flagged ids required", async () => {
    rpcMock.mockResolvedValue({
      data: {
        eventId: EVENT_ID,
        status: "planning",
        outcome: "rejected",
        flaggedBookingCount: 2,
        flaggedRequirementCount: 3,
      },
      error: null,
    });

    const response = await decisionRequest({
      decision: "rejected",
      reason: "Crowd movement plan is incomplete.",
    });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("decide_event_safety_check", {
      p_event_id: EVENT_ID,
      p_decision: "rejected",
      p_reason: "Crowd movement plan is incomplete.",
      p_flagged_booking_ids: [],
      p_flagged_requirement_ids: [],
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(createApp())
      .post(`/events/${EVENT_ID}/safety-check-decision`)
      .send({ decision: "rejected", reason: "No reason" });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a blank reason before calling the database", async () => {
    const response = await decisionRequest({ decision: "rejected", reason: "   " });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an unrecognised decision value before calling the database", async () => {
    const response = await decisionRequest({ decision: "approved", reason: "Looks fine" });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only a Safety Officer can decide an event's safety check" },
    });

    const response = await decisionRequest({ decision: "rejected", reason: "Not safe" });

    expect(response.status).toBe(403);
  });

  it("maps 23514 to a 422", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "Select at least one venue booking or equipment arrangement to flag",
      },
    });

    const response = await decisionRequest({
      decision: "changes_requested",
      reason: "Needs rework",
      flaggedBookingIds: [],
      flaggedRequirementIds: [],
    });

    expect(response.status).toBe(422);
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await decisionRequest({ decision: "rejected", reason: "Not safe" });

    expect(response.status).toBe(500);
  });
});
