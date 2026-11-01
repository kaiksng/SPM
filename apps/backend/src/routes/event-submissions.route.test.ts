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

function authedRequest() {
  return request(server())
    .post(`/events/${EVENT_ID}/submit`)
    .set("Authorization", "Bearer test-token");
}

describe("POST /events/:eventId/submit", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  // AC05.
  it("returns the submission result on success", async () => {
    rpcMock.mockResolvedValue({
      data: {
        eventId: EVENT_ID,
        status: "requested",
        submittedAt: "2026-09-13T00:00:00Z",
        assignedCoordinatorId: "20000000-0000-0000-0000-000000000002",
      },
      error: null,
    });

    const response = await authedRequest();

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("requested");
    expect(rpcMock).toHaveBeenCalledWith("submit_event_request", {
      p_event_id: EVENT_ID,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server()).post(
      `/events/${EVENT_ID}/submit`,
    );

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid event id before calling the database", async () => {
    const response = await request(server())
      .post("/events/not-a-uuid/submit")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // insufficient_privilege: wrong owner, wrong role, or not a draft.
  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Event request not found or cannot be submitted",
      },
    });

    const response = await authedRequest();

    expect(response.status).toBe(403);
    expect(response.body.error).toBe(
      "Event request not found or cannot be submitted",
    );
  });

  // AC06: every affected field is returned, not just the first.
  it("maps 23514 to a 422 carrying every affected field", async () => {
    const fields = [
      { field: "purpose", message: "Describe the purpose of the event before submitting" },
      { field: "requirementsAcknowledged", message: "Confirm that each optional requirement is provided or not required" },
    ];
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "This event request is not ready to submit",
        details: JSON.stringify(fields),
      },
    });

    const response = await authedRequest();

    expect(response.status).toBe(422);
    expect(response.body.fields).toEqual(fields);
  });

  it("returns a generic 422 when the failure detail cannot be parsed", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "This event request is not ready to submit" },
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
