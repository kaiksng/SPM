import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  checkVenueBookingAvailability,
  confirmVenueBookingHold,
  getActiveVenueBooking,
  getVenueBookingRequest,
  listVenueBookingRequests,
  listVenueBookingsForEvent,
  placeVenueBookingHold,
  requestReplacementVenue,
  setMainVenueBooking,
  submitVenueBookingRequest,
  withdrawVenueBookingRequest,
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
    events: {
      title: "Career Fair",
      expected_attendance: 50,
      event_venue_requirements: {
        preferred_location: "Central Area",
        minimum_capacity: 60,
        accessibility_notes: "Step-free entrance",
        layout_notes: "Theatre",
      },
      event_required_facilities: [{ facility_name: "Parking" }, { facility_name: "Pantry" }],
    },
    requested_by: { full_name: "Priya" },
    decided_by: null,
    replaces_booking_id: null,
    advisory_notes: null,
    label: "Main Programme",
    expected_headcount: 50,
    is_main_venue: true,
    layout_notes: "Theatre",
    accessibility_notes: "Step-free entrance",
    required_facilities: ["Parking", "Pantry"],
    cancellation_reason: null,
    cancelled_at: null,
    cancelled_by_profile: null,
    main_designated_at: null,
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

describe("submitVenueBookingRequest", () => {
  it("sends only the event and venue for the event's first booking", async () => {
    apiFetchMock.mockResolvedValue({ data: "booking-1" });

    await expect(submitVenueBookingRequest("event-1", "venue-1")).resolves.toBe("booking-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/venue-bookings/submit", {
      method: "POST",
      body: JSON.stringify({ eventId: "event-1", venueId: "venue-1" }),
    });
  });

  // SPM-85 AC02: an additional booking sends its own label, period, headcount and needs.
  it("AC02: sends an additional booking's own details", async () => {
    apiFetchMock.mockResolvedValue({ data: "booking-2" });
    const details = {
      label: "Breakout 1",
      startsAt: "2099-04-06T02:00:00.000Z",
      endsAt: "2099-04-06T03:30:00.000Z",
      expectedHeadcount: 40,
    };

    await submitVenueBookingRequest("event-1", "venue-2", details);

    expect(apiFetchMock).toHaveBeenCalledWith("/venue-bookings/submit", {
      method: "POST",
      body: JSON.stringify({ eventId: "event-1", venueId: "venue-2", details }),
    });
  });
});

describe("withdrawVenueBookingRequest", () => {
  // SPM-85 AC10: a reason travels with the withdrawal or cancellation.
  it("AC10: sends the reason to the booking's withdraw endpoint", async () => {
    apiFetchMock.mockResolvedValue({ data: "booking-1" });

    await withdrawVenueBookingRequest("booking-1", "Speaker dropped out");

    expect(apiFetchMock).toHaveBeenCalledWith("/venue-bookings/booking-1/withdraw", {
      method: "POST",
      body: JSON.stringify({ reason: "Speaker dropped out" }),
    });
  });
});

describe("setMainVenueBooking", () => {
  it("AC07: asks the database to make the booking the main venue", async () => {
    rpcMock.mockResolvedValue({ data: "booking-2", error: null });

    await setMainVenueBooking("booking-2");

    expect(rpcMock).toHaveBeenCalledWith("set_main_venue_booking", { p_booking_id: "booking-2" });
  });

  it("surfaces the database's message when it is refused", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Only the assigned coordinator can change the main venue of this event" },
    });

    await expect(setMainVenueBooking("booking-2")).rejects.toThrow("Only the assigned coordinator");
  });
});

describe("checkVenueBookingAvailability", () => {
  it("checks the event's own period by default", async () => {
    rpcMock.mockResolvedValue({ data: { available: true, reason: null }, error: null });

    await checkVenueBookingAvailability("venue-1", "event-1");

    expect(rpcMock).toHaveBeenCalledWith("check_venue_booking_availability", {
      p_venue_id: "venue-1",
      p_event_id: "event-1",
    });
  });

  // SPM-85 AC04: an additional booking is checked for its own period.
  it("AC04: checks a booking's own period when one is given", async () => {
    rpcMock.mockResolvedValue({ data: { available: false, reason: "Occupied" }, error: null });

    await expect(
      checkVenueBookingAvailability("venue-1", "event-1", {
        startsAt: "2099-04-06T02:00:00.000Z",
        endsAt: "2099-04-06T03:30:00.000Z",
      }),
    ).resolves.toEqual({ available: false, reason: "Occupied" });
    expect(rpcMock).toHaveBeenCalledWith("check_venue_booking_availability", {
      p_venue_id: "venue-1",
      p_event_id: "event-1",
      p_starts_at: "2099-04-06T02:00:00.000Z",
      p_ends_at: "2099-04-06T03:30:00.000Z",
    });
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
  // SPM-85 AC02/AC07/AC08: each booking carries its own label, headcount and main flag.
  it("AC08: returns every booking with its label, headcount and main-venue flag", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          bookingRow({ id: "main" }),
          bookingRow({
            id: "breakout",
            label: "Breakout 1",
            expected_headcount: 40,
            is_main_venue: false,
            venues: { name: "Room 2.01", location: "Convention", area_tags: ["Marina Bay"], venue_layouts: [] },
          }),
        ],
        error: null,
      }),
    );

    const bookings = await listVenueBookingsForEvent("event-1");

    expect(bookings.map((b) => [b.label, b.expectedHeadcount, b.isMainVenue])).toEqual([
      ["Main Programme", 50, true],
      ["Breakout 1", 40, false],
    ]);
    expect(bookings[1]?.venueLocation).toBe("Convention");
    expect(bookings[1]?.venueAreaTags).toEqual(["Marina Bay"]);
  });

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

// An on_hold row is only swept to "expired" lazily (expire_stale_venue_holds,
// on the next write to that venue), so every read computes it live against
// the clock. The clock is frozen so the deadlines below are exact.
describe("hold expiry", () => {
  const NOW = new Date("2099-04-03T04:00:00.000Z");
  const ONE_MINUTE_AGO = "2099-04-03T03:59:00.000Z";
  const ONE_MINUTE_FROM_NOW = "2099-04-03T04:01:00.000Z";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getActiveVenueBooking", () => {
    function givenActiveBooking(overrides: Record<string, unknown>) {
      fromMock.mockReturnValue(
        queryBuilder({
          data: {
            id: "booking-1",
            venue_id: "venue-1",
            starts_at: "2099-04-06T02:00:00Z",
            ends_at: "2099-04-06T04:00:00Z",
            status: "on_hold",
            expires_at: ONE_MINUTE_FROM_NOW,
            replaces_booking_id: null,
            venues: { name: "Auditorium" },
            ...overrides,
          },
          error: null,
        }),
      );
    }

    it("keeps a hold whose deadline is still ahead On Hold", async () => {
      givenActiveBooking({ expires_at: ONE_MINUTE_FROM_NOW });

      expect(await getActiveVenueBooking("event-1")).toMatchObject({
        status: "on_hold",
        expiresAt: ONE_MINUTE_FROM_NOW,
      });
    });

    it("shows a hold whose deadline has passed as Expired", async () => {
      givenActiveBooking({ expires_at: ONE_MINUTE_AGO });

      expect((await getActiveVenueBooking("event-1"))?.status).toBe("expired");
    });

    it("treats a deadline of exactly now as Expired", async () => {
      givenActiveBooking({ expires_at: NOW.toISOString() });

      expect((await getActiveVenueBooking("event-1"))?.status).toBe("expired");
    });

    it("keeps a hold with no deadline recorded On Hold", async () => {
      givenActiveBooking({ expires_at: null });

      expect((await getActiveVenueBooking("event-1"))?.status).toBe("on_hold");
    });

    it.each(["pending", "approved"])(
      "never expires a %s booking, even with a past expires_at",
      async (status) => {
        givenActiveBooking({ status, expires_at: ONE_MINUTE_AGO });

        expect((await getActiveVenueBooking("event-1"))?.status).toBe(status);
      },
    );
  });

  // Venue Staff's Requests page, an event's booking history and a single
  // request all share toVenueBookingRequestSummary, so each must expire holds.
  describe.each([
    ["listVenueBookingRequests", () => listVenueBookingRequests(), true],
    ["listVenueBookingsForEvent", () => listVenueBookingsForEvent("event-1"), true],
    ["getVenueBookingRequest", () => getVenueBookingRequest("booking-1"), false],
  ] as const)("%s", (_name, load, returnsList) => {
    async function statusesFor(rows: ReturnType<typeof bookingRow>[]) {
      fromMock.mockReturnValue(queryBuilder({ data: returnsList ? rows : rows[0], error: null }));
      const result = await load();
      return (Array.isArray(result) ? result : [result]).map((request) => request.status);
    }

    it("shows a lapsed hold as Expired and a live one as On Hold", async () => {
      if (returnsList) {
        expect(
          await statusesFor([
            bookingRow({ id: "live", status: "on_hold", expires_at: ONE_MINUTE_FROM_NOW }),
            bookingRow({ id: "lapsed", status: "on_hold", expires_at: ONE_MINUTE_AGO }),
          ]),
        ).toEqual(["on_hold", "expired"]);
      } else {
        expect(await statusesFor([bookingRow({ status: "on_hold", expires_at: ONE_MINUTE_AGO })])).toEqual(["expired"]);
        expect(await statusesFor([bookingRow({ status: "on_hold", expires_at: ONE_MINUTE_FROM_NOW })])).toEqual(["on_hold"]);
      }
    });

    it("leaves decided requests unchanged", async () => {
      expect(await statusesFor([bookingRow({ status: "approved", expires_at: ONE_MINUTE_AGO })])).toEqual([
        "approved",
      ]);
    });
  });

  it("starts expiring a hold once the clock passes its deadline", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: bookingRow({ status: "on_hold", expires_at: ONE_MINUTE_FROM_NOW }), error: null }),
    );
    expect((await getVenueBookingRequest("booking-1")).status).toBe("on_hold");

    vi.setSystemTime(new Date("2099-04-03T04:02:00.000Z"));

    expect((await getVenueBookingRequest("booking-1")).status).toBe("expired");
  });
});

describe("getVenueBookingRequest", () => {
  it("maps one request, leaving the replaced venue unnamed (a single lookup has no list to name it from)", async () => {
    const query = queryBuilder({
      data: bookingRow({
        replaces_booking_id: "booking-0",
        advisory_notes: "Accessibility: no step-free access listed.",
        decided_by: { full_name: "Sam Staff" },
        decided_at: "2099-04-02T00:00:00Z",
        decision_notes: "Confirmed",
      }),
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(getVenueBookingRequest("booking-1")).resolves.toEqual({
      id: "booking-1",
      status: "approved",
      startsAt: "2099-04-06T02:00:00Z",
      endsAt: "2099-04-06T04:00:00Z",
      requestedAt: "2099-04-01T00:00:00Z",
      decidedAt: "2099-04-02T00:00:00Z",
      decisionNotes: "Confirmed",
      expiresAt: null,
      venueId: "venue-1",
      venueName: "Auditorium",
      venueLayouts: [],
      eventId: "event-1",
      eventTitle: "Career Fair",
      eventExpectedAttendance: 50,
      eventVenueRequirements: {
        preferredLocation: "Central Area",
        minimumCapacity: 60,
        accessibilityNotes: "Step-free entrance",
        layoutNotes: "Theatre",
        facilities: ["Parking", "Pantry"],
      },
      requestedByName: "Priya",
      decidedByName: "Sam Staff",
      replacesBookingId: "booking-0",
      replacesVenueName: null,
      advisoryNotes: "Accessibility: no step-free access listed.",
      label: "Main Programme",
      expectedHeadcount: 50,
      isMainVenue: true,
      venueLocation: null,
      venueAreaTags: [],
      cancellationReason: null,
      cancelledAt: null,
      cancelledByName: null,
      mainDesignatedAt: null,
    });
    expect(query.eq).toHaveBeenCalledWith("id", "booking-1");
  });

  it("uses readable fallbacks when related records are missing", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: bookingRow({
          venues: null, events: null, requested_by: null,
          layout_notes: null, accessibility_notes: null, required_facilities: [],
        }),
        error: null,
      }),
    );

    expect(await getVenueBookingRequest("booking-1")).toMatchObject({
      venueName: "Unknown venue",
      venueLayouts: [],
      eventTitle: "Unknown event",
      eventExpectedAttendance: null,
      eventVenueRequirements: {
        preferredLocation: null,
        minimumCapacity: null,
        accessibilityNotes: null,
        layoutNotes: null,
        facilities: [],
      },
      requestedByName: null,
    });
  });

  // SPM-85: the layout, accessibility and facilities are the booking's own, so a
  // breakout room is judged on what it needs, not on the main hall's needs.
  it("AC02: takes the room's own layout, accessibility and facilities from the booking", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: bookingRow({
          label: "Breakout 1", is_main_venue: false,
          layout_notes: "Classroom", accessibility_notes: null, required_facilities: ["Whiteboard"],
        }),
        error: null,
      }),
    );

    const request = await getVenueBookingRequest("booking-1");

    expect(request.eventVenueRequirements).toEqual({
      preferredLocation: "Central Area",
      minimumCapacity: 60,
      accessibilityNotes: null,
      layoutNotes: "Classroom",
      facilities: ["Whiteboard"],
    });
  });

  // SPM-24 AC05: a request carries the event's venue requirements for Venue Staff.
  it("loads the event's venue requirements with the request", async () => {
    const query = queryBuilder({ data: bookingRow(), error: null });
    fromMock.mockReturnValue(query);

    const request = await getVenueBookingRequest("booking-1");

    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("event_venue_requirements"));
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("event_required_facilities"));
    expect(request.eventVenueRequirements).toEqual({
      preferredLocation: "Central Area",
      minimumCapacity: 60,
      accessibilityNotes: "Step-free entrance",
      layoutNotes: "Theatre",
      facilities: ["Parking", "Pantry"],
    });
  });

  it.each([
    ["the query fails", { data: null, error: { message: "boom" } }],
    ["the request is not visible", { data: null, error: null }],
  ])("explains when %s", async (_label, result) => {
    fromMock.mockReturnValue(queryBuilder(result));

    await expect(getVenueBookingRequest("booking-1")).rejects.toThrow(
      "This venue booking request is unavailable or you do not have access to it.",
    );
  });
});

describe("placing and confirming a hold", () => {
  it("places a hold through the backend with its deadline", async () => {
    apiFetchMock.mockResolvedValue({ data: null });

    await placeVenueBookingHold("booking-1", "2099-04-05T01:00:00.000Z");

    expect(apiFetchMock).toHaveBeenCalledWith("/venue-bookings/booking-1/hold", {
      method: "POST",
      body: JSON.stringify({ expiresAt: "2099-04-05T01:00:00.000Z" }),
    });
  });

  it("confirms a hold through the backend", async () => {
    apiFetchMock.mockResolvedValue({ data: null });

    await confirmVenueBookingHold("booking-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/venue-bookings/booking-1/confirm-hold", {
      method: "POST",
    });
  });

  it("passes the database's reason through when a hold is refused", async () => {
    apiFetchMock.mockRejectedValue(new Error("The hold must expire before the requested period starts"));

    await expect(placeVenueBookingHold("booking-1", "2099-04-07T01:00:00.000Z")).rejects.toThrow(
      "The hold must expire before the requested period starts",
    );
  });
});
