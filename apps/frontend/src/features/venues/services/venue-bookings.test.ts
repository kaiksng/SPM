import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: apiFetchMock };
});

import {
  getActiveVenueBooking,
  listVenueBookingsForEvent,
  requestReplacementVenue,
} from "./venue-bookings";

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    status: "approved",
    starts_at: "2099-04-06T02:00:00Z",
    ends_at: "2099-04-06T04:00:00Z",
    requested_at: "2099-04-01T00:00:00Z",
    decided_at: null,
    decision_notes: null,
    expires_at: null,
    venue_id: "venue-1",
    venues: { name: "Auditorium", venue_layouts: [] },
    event_id: "event-1",
    events: { title: "Career Fair", expected_attendance: 50 },
    requested_by: { full_name: "Priya" },
    decided_by: null,
    replaces_booking_id: null,
    advisory_notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  apiFetchMock.mockReset();
});

describe("requestReplacementVenue", () => {
  // SPM-82 AC04: only the new venue is chosen; the period etc. are copied server-side.
  it("posts the chosen venue to the booking's replacement endpoint and returns the new booking id", async () => {
    apiFetchMock.mockResolvedValue({ data: "replacement-1" });

    await expect(requestReplacementVenue("booking-1", "venue-2")).resolves.toBe("replacement-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/venue-bookings/booking-1/replacement", {
      method: "POST",
      body: JSON.stringify({ venueId: "venue-2" }),
    });
  });

  it("surfaces the server's message when the request is refused", async () => {
    apiFetchMock.mockRejectedValue(new Error("This venue booking already has a pending replacement request"));

    await expect(requestReplacementVenue("booking-1", "venue-2")).rejects.toThrow(
      "pending replacement request",
    );
  });
});

describe("getActiveVenueBooking", () => {
  // SPM-82: a disrupted original and its pending replacement are both active, so
  // the most recent one is returned instead of failing on two rows.
  it("returns the most recently requested active booking, with the booking it replaces", async () => {
    const query = queryBuilder({
      data: {
        id: "replacement-1",
        venue_id: "venue-2",
        starts_at: "2099-04-06T02:00:00Z",
        ends_at: "2099-04-06T04:00:00Z",
        status: "pending",
        expires_at: null,
        replaces_booking_id: "booking-1",
        venues: { name: "Grand Hall" },
      },
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(getActiveVenueBooking("event-1")).resolves.toEqual({
      id: "replacement-1",
      venueId: "venue-2",
      venueName: "Grand Hall",
      startsAt: "2099-04-06T02:00:00Z",
      endsAt: "2099-04-06T04:00:00Z",
      status: "pending",
      expiresAt: null,
      replacesBookingId: "booking-1",
    });
    expect(query.in).toHaveBeenCalledWith("status", ["pending", "approved", "on_hold"]);
    expect(query.order).toHaveBeenCalledWith("requested_at", { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("returns null when the event has no active booking", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(getActiveVenueBooking("event-1")).resolves.toBeNull();
  });

  it("explains when the status cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(getActiveVenueBooking("event-1")).rejects.toThrow(
      "This event's venue booking status is unavailable.",
    );
  });
});

describe("listVenueBookingsForEvent", () => {
  // SPM-82 AC09: the replacement carries the link and the name of the venue it replaces.
  it("links a replacement to the booking it replaces and names that venue", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          bookingRow({ id: "booking-1", status: "cancelled" }),
          bookingRow({
            id: "replacement-1",
            venue_id: "venue-2",
            venues: { name: "Grand Hall", venue_layouts: [] },
            replaces_booking_id: "booking-1",
            requested_at: "2099-04-02T00:00:00Z",
          }),
        ],
        error: null,
      }),
    );

    const bookings = await listVenueBookingsForEvent("event-1");

    expect(bookings[0]).toMatchObject({ id: "booking-1", replacesBookingId: null, replacesVenueName: null });
    expect(bookings[1]).toMatchObject({
      id: "replacement-1",
      venueName: "Grand Hall",
      replacesBookingId: "booking-1",
      replacesVenueName: "Auditorium",
    });
  });

  it("carries the advisory note recorded for a replacement venue", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [bookingRow({ id: "r1", replaces_booking_id: "booking-1", advisory_notes: "Layout: the event asked for \"Theatre\"." })],
        error: null,
      }),
    );

    const [booking] = await listVenueBookingsForEvent("event-1");

    expect(booking?.advisoryNotes).toBe('Layout: the event asked for "Theatre".');
  });

  it("leaves the replaced venue unnamed when the original is not in the list", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: [bookingRow({ id: "replacement-1", replaces_booking_id: "hidden" })], error: null }),
    );

    const [booking] = await listVenueBookingsForEvent("event-1");

    expect(booking).toMatchObject({ replacesBookingId: "hidden", replacesVenueName: null });
  });
});
