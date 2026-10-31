import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { listVenueBookingFlagsForEvent } from "./venue-booking-flags";

function tables(conflicts: ReturnType<typeof queryBuilder>, disruptions: ReturnType<typeof queryBuilder>) {
  fromMock.mockImplementation((table: string) =>
    table === "venue_booking_conflicts" ? conflicts : disruptions,
  );
}

beforeEach(() => {
  fromMock.mockReset();
});

describe("listVenueBookingFlagsForEvent", () => {
  // SPM-9: open and cleared conflicts and disruptions on one event's bookings.
  it("returns the event's conflicts and disruptions, open and cleared", async () => {
    const conflicts = queryBuilder({
      data: [
        {
          id: 7,
          flagged_at: "2099-04-04T00:00:00.000Z",
          resolved_at: "2099-04-05T00:00:00.000Z",
          booking: { id: "b-1", event_id: "event-1" },
          conflicting_booking: { events: { title: "F1 event 2" } },
          conflicting_block: null,
          flagged_by_profile: { full_name: "Daryl" },
          resolved_by_profile: { full_name: "Keith" },
        },
      ],
      error: null,
    });
    const disruptions = queryBuilder({
      data: [
        {
          id: "d-1",
          flagged_at: "2099-04-03T00:00:00.000Z",
          cleared_at: null,
          booking: { id: "b-1", event_id: "event-1" },
          block: { reason: "failed mic", starts_at: "2099-04-06T09:00:00.000Z", ends_at: "2099-04-06T10:00:00.000Z" },
          flagged_by_profile: null,
          cleared_by_profile: null,
        },
      ],
      error: null,
    });
    tables(conflicts, disruptions);

    const flags = await listVenueBookingFlagsForEvent("event-1");

    expect(conflicts.eq).toHaveBeenCalledWith("booking.event_id", "event-1");
    expect(disruptions.eq).toHaveBeenCalledWith("booking.event_id", "event-1");
    expect(flags).toEqual([
      {
        id: "conflict-7",
        kind: "conflict",
        bookingId: "b-1",
        conflictingEventTitle: "F1 event 2",
        blockReason: null,
        blockStartsAt: null,
        blockEndsAt: null,
        flaggedAt: "2099-04-04T00:00:00.000Z",
        flaggedByName: "Daryl",
        clearedAt: "2099-04-05T00:00:00.000Z",
        clearedByName: "Keith",
      },
      {
        id: "disruption-d-1",
        kind: "disruption",
        bookingId: "b-1",
        conflictingEventTitle: null,
        blockReason: "failed mic",
        blockStartsAt: "2099-04-06T09:00:00.000Z",
        blockEndsAt: "2099-04-06T10:00:00.000Z",
        flaggedAt: "2099-04-03T00:00:00.000Z",
        flaggedByName: null,
        clearedAt: null,
        clearedByName: null,
      },
    ]);
  });

  it("reports a load failure", async () => {
    tables(queryBuilder({ data: null, error: { message: "boom" } }), queryBuilder({ data: [], error: null }));

    await expect(listVenueBookingFlagsForEvent("event-1")).rejects.toThrow(
      "This event's venue conflicts and disruptions are unavailable.",
    );
  });
});
