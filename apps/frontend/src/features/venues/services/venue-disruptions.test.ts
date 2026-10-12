import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { listVenueDisruptionsForCoordinator } from "./venue-disruptions";

function row(overrides: Record<string, unknown> = {}, bookingStatus = "approved") {
  return {
    id: "disruption-1",
    flagged_at: "2099-04-01T00:00:00Z",
    cleared_at: null,
    booking: {
      id: "booking-1",
      event_id: "event-1",
      venue_id: "venue-1",
      starts_at: "2099-04-06T02:00:00Z",
      ends_at: "2099-04-06T04:00:00Z",
      status: bookingStatus,
      event: { title: "Career Fair" },
      venue: { name: "Auditorium" },
    },
    block: {
      reason_category: "maintenance",
      reason: "Air-conditioning repair",
      starts_at: "2099-04-06T04:00:00Z",
      ends_at: "2099-04-06T06:00:00Z",
    },
    ...overrides,
  };
}

beforeEach(() => fromMock.mockReset());

describe("listVenueDisruptionsForCoordinator", () => {
  // SPM-83 AC: an open disruption on an active booking needs a replacement.
  it("maps an open disruption as Replacement Required", async () => {
    const query = queryBuilder({ data: [row()], error: null });
    fromMock.mockReturnValue(query);

    await expect(listVenueDisruptionsForCoordinator()).resolves.toEqual([
      {
        id: "disruption-1",
        bookingId: "booking-1",
        eventId: "event-1",
        eventTitle: "Career Fair",
        venueId: "venue-1",
        venueName: "Auditorium",
        bookingStartsAt: "2099-04-06T02:00:00Z",
        bookingEndsAt: "2099-04-06T04:00:00Z",
        blockReasonCategory: "maintenance",
        blockReason: "Air-conditioning repair",
        blockStartsAt: "2099-04-06T04:00:00Z",
        blockEndsAt: "2099-04-06T06:00:00Z",
        flaggedAt: "2099-04-01T00:00:00Z",
        clearedAt: null,
        state: "replacement_required",
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("venue_booking_disruptions");
  });

  it("treats a cleared disruption, or one on a booking that is no longer active, as Resolved", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          row({ id: "cleared", cleared_at: "2099-04-02T00:00:00Z" }),
          row({ id: "cancelled" }, "cancelled"),
        ],
        error: null,
      }),
    );

    const result = await listVenueDisruptionsForCoordinator();

    expect(result.map((item) => [item.id, item.state])).toEqual([
      ["cleared", "resolved"],
      ["cancelled", "resolved"],
    ]);
  });

  it("lists open disruptions before resolved ones", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [row({ id: "done", cleared_at: "2099-04-02T00:00:00Z" }), row({ id: "open" })],
        error: null,
      }),
    );

    const result = await listVenueDisruptionsForCoordinator();

    expect(result.map((item) => item.id)).toEqual(["open", "done"]);
  });

  it("returns an empty list when there are none", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(listVenueDisruptionsForCoordinator()).resolves.toEqual([]);
  });

  it("explains when the list cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listVenueDisruptionsForCoordinator()).rejects.toThrow(
      "We couldn't load your affected venue bookings.",
    );
  });
});
