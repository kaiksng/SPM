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
const VENUE_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const USER_ID = "ea333cdb-21d1-4819-8fb0-ec64508d8323";

function authedRequest(body: unknown) {
  return request(server())
    .post("/venue-bookings/submit")
    .set("Authorization", "Bearer test-token")
    .send(body as object);
}

describe("POST /venue-bookings/submit", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it("returns the new booking id on success", async () => {
    rpcMock.mockResolvedValue({ data: "booking-1", error: null });

    const response = await authedRequest({ eventId: EVENT_ID, venueId: VENUE_ID });

    expect(response.status).toBe(200);
    expect(response.body.data).toBe("booking-1");
    expect(rpcMock).toHaveBeenCalledWith("submit_venue_booking_request", {
      p_event_id: EVENT_ID,
      p_venue_id: VENUE_ID,
      p_actor_id: USER_ID,
    });
  });

  it("AC02: passes an additional booking's own label, period, headcount and needs to the database", async () => {
    rpcMock.mockResolvedValue({ data: "booking-2", error: null });

    const response = await authedRequest({
      eventId: EVENT_ID,
      venueId: VENUE_ID,
      details: {
        label: "Breakout 1",
        startsAt: "2099-04-06T10:00:00+08:00",
        endsAt: "2099-04-06T11:30:00+08:00",
        expectedHeadcount: 40,
        layoutNotes: "Classroom",
        requiredFacilities: ["Whiteboard"],
      },
    });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("submit_venue_booking_request", {
      p_event_id: EVENT_ID,
      p_venue_id: VENUE_ID,
      p_actor_id: USER_ID,
      p_label: "Breakout 1",
      p_starts_at: "2099-04-06T10:00:00+08:00",
      p_ends_at: "2099-04-06T11:30:00+08:00",
      p_expected_headcount: 40,
      p_layout_notes: "Classroom",
      p_accessibility_notes: undefined,
      p_required_facilities: ["Whiteboard"],
    });
  });

  it("AC02: rejects invalid booking details before calling the database", async () => {
    const response = await authedRequest({
      eventId: EVENT_ID,
      venueId: VENUE_ID,
      details: {
        label: " ",
        startsAt: "2099-04-06T10:00:00+08:00",
        endsAt: "2099-04-06T11:30:00+08:00",
        expectedHeadcount: 40,
      },
    });

    expect(response.status).toBe(422);
    expect(response.body.error).toBe("Give this booking a label, for example Breakout 1");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post("/venue-bookings/submit")
      .send({ eventId: EVENT_ID, venueId: VENUE_ID });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing venueId before calling the database", async () => {
    const response = await authedRequest({ eventId: EVENT_ID });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the assigned coordinator can submit a venue booking request for this event",
      },
    });

    const response = await authedRequest({ eventId: EVENT_ID, venueId: VENUE_ID });

    expect(response.status).toBe(403);
  });

  it("maps 23514 to a 422, preserving the database's own message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "This venue already has a Pending or Approved booking for part of this event's schedule",
      },
    });

    const response = await authedRequest({ eventId: EVENT_ID, venueId: VENUE_ID });

    expect(response.status).toBe(422);
    expect(response.body.error).toContain("Pending or Approved booking");
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await authedRequest({ eventId: EVENT_ID, venueId: VENUE_ID });

    expect(response.status).toBe(500);
  });
});

const BOOKING_ID = "5b9f1c24-7a3e-4d5b-9c11-2f6a8d3e4b70";

function replacementRequest(body: unknown, bookingId: string = BOOKING_ID) {
  return request(server())
    .post(`/venue-bookings/${bookingId}/replacement`)
    .set("Authorization", "Bearer test-token")
    .send(body as object);
}

// SPM-82: request a replacement venue for a disrupted booking.
describe("POST /venue-bookings/:bookingId/replacement", () => {
  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it("returns the replacement booking id and passes the signed-in user as the actor", async () => {
    rpcMock.mockResolvedValue({ data: "replacement-1", error: null });

    const response = await replacementRequest({ venueId: VENUE_ID });

    expect(response.status).toBe(200);
    expect(response.body.data).toBe("replacement-1");
    expect(rpcMock).toHaveBeenCalledWith("request_replacement_venue", {
      p_booking_id: BOOKING_ID,
      p_venue_id: VENUE_ID,
      p_actor_id: USER_ID,
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/venue-bookings/${BOOKING_ID}/replacement`)
      .send({ venueId: VENUE_ID });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing or malformed venueId before calling the database", async () => {
    expect((await replacementRequest({})).status).toBe(422);
    expect((await replacementRequest({ venueId: "not-a-uuid" })).status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed booking id before calling the database", async () => {
    const response = await replacementRequest({ venueId: VENUE_ID }, "not-a-uuid");

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "42501",
        message: "Only the assigned coordinator can request a replacement venue for this event",
      },
    });

    const response = await replacementRequest({ venueId: VENUE_ID });

    expect(response.status).toBe(403);
  });

  it("maps 23514 to a 422, preserving the database's own message", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        code: "23514",
        message: "This venue booking already has a pending replacement request",
      },
    });

    const response = await replacementRequest({ venueId: VENUE_ID });

    expect(response.status).toBe(422);
    expect(response.body.error).toContain("pending replacement request");
  });

  it("returns a 500 for an unexpected database error", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "XX000", message: "connection reset" } });

    const response = await replacementRequest({ venueId: VENUE_ID });

    expect(response.status).toBe(500);
  });
});

// SPM-85 AC10: withdraw a Pending booking or cancel an Approved one, with a reason.
describe("POST /venue-bookings/:bookingId/withdraw", () => {
  function withdrawRequest(body: unknown) {
    return request(server())
      .post(`/venue-bookings/${BOOKING_ID}/withdraw`)
      .set("Authorization", "Bearer test-token")
      .send(body as object);
  }

  beforeEach(() => {
    rpcMock.mockReset();
    getUserMock.mockReset();
    getUserMock.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
  });

  it("passes the reason and the signed-in user to the database", async () => {
    rpcMock.mockResolvedValue({ data: BOOKING_ID, error: null });

    const response = await withdrawRequest({ reason: "  Speaker dropped out " });

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("withdraw_venue_booking_request", {
      p_booking_id: BOOKING_ID,
      p_actor_id: USER_ID,
      p_reason: "Speaker dropped out",
    });
  });

  it("rejects a request with no bearer token", async () => {
    const response = await request(server())
      .post(`/venue-bookings/${BOOKING_ID}/withdraw`)
      .send({ reason: "x" });

    expect(response.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  // SPM-85 AC10: a malformed booking id never reaches the database.
  it("rejects a booking id that is not valid before calling the database", async () => {
    const response = await request(server())
      .post("/venue-bookings/not-a-booking/withdraw")
      .set("Authorization", "Bearer test-token")
      .send({ reason: "Not needed" });

    expect(response.status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("AC10: rejects a missing or blank reason before calling the database", async () => {
    expect((await withdrawRequest({})).status).toBe(422);
    expect((await withdrawRequest({ reason: "   " })).status).toBe(422);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("maps 42501 to a 403 and 23514 to a 422", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "Only the event's assigned coordinator can withdraw this request" },
    });
    expect((await withdrawRequest({ reason: "x" })).status).toBe(403);

    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "23514", message: "This booking has a pending replacement. Withdraw the replacement first" },
    });
    const refused = await withdrawRequest({ reason: "x" });
    expect(refused.status).toBe(422);
    expect(refused.body.error).toContain("pending replacement");
  });
});
