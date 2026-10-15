import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder, type QueryBuilderMock } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock },
}));

import { listVenueAvailability } from "./venue-availability";

// Frozen "now", so hold deadlines are compared against a fixed moment.
const NOW = new Date("2026-10-15T04:00:00.000Z");
const ONE_MINUTE_AGO = "2026-10-15T03:59:00.000Z";
const ONE_MINUTE_FROM_NOW = "2026-10-15T04:01:00.000Z";
const VIEWER_ID = "coordinator-1";

function bookingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    starts_at: "2026-10-20T01:00:00Z",
    ends_at: "2026-10-20T03:00:00Z",
    status: "pending",
    expires_at: null,
    requested_by: VIEWER_ID,
    events: { title: "Leadership Summit", organiser: { full_name: "Jasmine" } },
    coordinator: { full_name: "Joyce" },
    held_by: null,
    ...overrides,
  };
}

function blockRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "block-1",
    starts_at: "2026-10-21T00:00:00Z",
    ends_at: "2026-10-21T10:00:00Z",
    reason: "Annual maintenance",
    ...overrides,
  };
}

/** listVenueAvailability reads venue_bookings and venue_unavailability in parallel. */
function givenAvailability(
  bookings: { data: unknown; error: unknown },
  blocks: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const queries: Record<string, QueryBuilderMock> = {
    venue_bookings: queryBuilder(bookings),
    venue_unavailability: queryBuilder(blocks),
  };
  fromMock.mockImplementation((table: string) => queries[table]);
  return queries;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  fromMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("listVenueAvailability", () => {
  describe("hold expiry (computed live; the stored status is only swept to 'expired' lazily)", () => {
    it("shows a hold whose deadline is still ahead as On Hold, with who placed it", async () => {
      givenAvailability({
        data: [bookingRow({ status: "on_hold", expires_at: ONE_MINUTE_FROM_NOW, held_by: { full_name: "Daryl" } })],
        error: null,
      });

      const [period] = await listVenueAvailability("venue-1", VIEWER_ID);

      expect(period).toMatchObject({ type: "on_hold", heldByName: "Daryl" });
    });

    it("hides a hold whose deadline has passed, freeing the slot on the calendar", async () => {
      givenAvailability({
        data: [bookingRow({ id: "lapsed", status: "on_hold", expires_at: ONE_MINUTE_AGO })],
        error: null,
      });

      await expect(listVenueAvailability("venue-1", VIEWER_ID)).resolves.toEqual([]);
    });

    it("hides a hold whose deadline is exactly now", async () => {
      givenAvailability({
        data: [bookingRow({ status: "on_hold", expires_at: NOW.toISOString() })],
        error: null,
      });

      await expect(listVenueAvailability("venue-1", VIEWER_ID)).resolves.toEqual([]);
    });

    it("drops only the lapsed hold and keeps everything else", async () => {
      givenAvailability(
        {
          data: [
            bookingRow({ id: "live-hold", status: "on_hold", expires_at: ONE_MINUTE_FROM_NOW }),
            bookingRow({ id: "lapsed-hold", status: "on_hold", expires_at: ONE_MINUTE_AGO }),
            bookingRow({ id: "pending", status: "pending" }),
            bookingRow({ id: "approved", status: "approved" }),
          ],
          error: null,
        },
        { data: [blockRow()], error: null },
      );

      const periods = await listVenueAvailability("venue-1", VIEWER_ID);

      expect(periods.map((period) => [period.id, period.type])).toEqual([
        ["live-hold", "on_hold"],
        ["pending", "pending"],
        ["approved", "confirmed"],
        ["block-1", "blocked"],
      ]);
    });

    it("hides a hold as soon as the clock passes its deadline", async () => {
      givenAvailability({
        data: [bookingRow({ status: "on_hold", expires_at: ONE_MINUTE_FROM_NOW })],
        error: null,
      });
      expect(await listVenueAvailability("venue-1", VIEWER_ID)).toHaveLength(1);

      vi.setSystemTime(new Date("2026-10-15T04:02:00.000Z"));

      expect(await listVenueAvailability("venue-1", VIEWER_ID)).toHaveLength(0);
    });

    it("never hides a pending or approved booking because of a past expires_at", async () => {
      givenAvailability({
        data: [
          bookingRow({ id: "pending", status: "pending", expires_at: ONE_MINUTE_AGO }),
          bookingRow({ id: "approved", status: "approved", expires_at: ONE_MINUTE_AGO }),
        ],
        error: null,
      });

      const periods = await listVenueAvailability("venue-1", VIEWER_ID);

      expect(periods.map((period) => period.id)).toEqual(["pending", "approved"]);
    });
  });

  it("reads this venue's active bookings and its non-removed blocks", async () => {
    const queries = givenAvailability({ data: [], error: null });

    await listVenueAvailability("venue-1", VIEWER_ID);

    expect(queries.venue_bookings!.eq).toHaveBeenCalledWith("venue_id", "venue-1");
    expect(queries.venue_bookings!.in).toHaveBeenCalledWith("status", ["pending", "approved", "on_hold"]);
    expect(queries.venue_unavailability!.eq).toHaveBeenCalledWith("venue_id", "venue-1");
    expect(queries.venue_unavailability!.is).toHaveBeenCalledWith("removed_at", null);
  });

  it("maps a booking with its event, organiser, coordinator and whether it is the viewer's", async () => {
    givenAvailability({ data: [bookingRow({ status: "approved" })], error: null });

    await expect(listVenueAvailability("venue-1", VIEWER_ID)).resolves.toEqual([
      {
        id: "booking-1",
        type: "confirmed",
        startsAt: "2026-10-20T01:00:00Z",
        endsAt: "2026-10-20T03:00:00Z",
        label: "Leadership Summit",
        organiserName: "Jasmine",
        coordinatorName: "Joyce",
        heldByName: null,
        isMine: true,
      },
    ]);
  });

  it.each([
    ["another coordinator's booking", "coordinator-2"],
    ["a signed-out viewer", null],
  ])("marks %s as not the viewer's", async (_label, viewerId) => {
    givenAvailability({ data: [bookingRow()], error: null });

    const [period] = await listVenueAvailability("venue-1", viewerId);

    expect(period?.isMine).toBe(false);
  });

  it("falls back to 'Booking' and no names when related records are missing", async () => {
    givenAvailability({ data: [bookingRow({ events: null, coordinator: null })], error: null });

    const [period] = await listVenueAvailability("venue-1", VIEWER_ID);

    expect(period).toMatchObject({ label: "Booking", organiserName: null, coordinatorName: null });
  });

  it.each([
    ["its reason", "Annual maintenance", "Annual maintenance"],
    ["a placeholder when the reason is blank", "   ", "Reason not recorded"],
    ["a placeholder when there is no reason", null, "Reason not recorded"],
  ])("labels a block with %s", async (_label, reason, expected) => {
    givenAvailability({ data: [], error: null }, { data: [blockRow({ reason })], error: null });

    const [period] = await listVenueAvailability("venue-1", VIEWER_ID);

    expect(period).toMatchObject({
      type: "blocked",
      label: expected,
      organiserName: null,
      coordinatorName: null,
      heldByName: null,
      isMine: false,
    });
  });

  it.each([
    ["the bookings query", { data: null, error: { message: "boom" } }, { data: [], error: null }],
    ["the blocks query", { data: [], error: null }, { data: null, error: { message: "boom" } }],
  ])("throws a friendly error when %s fails", async (_label, bookings, blocks) => {
    givenAvailability(bookings, blocks);

    await expect(listVenueAvailability("venue-1", VIEWER_ID)).rejects.toThrow(
      "We couldn't load this venue's availability.",
    );
  });
});
