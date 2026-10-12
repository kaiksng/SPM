import type { VenueBlockFormValues } from "@spm/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

import {
  createVenueBlock,
  listVenueBlocks,
  previewVenueBlockImpact,
  removeVenueBlock,
  shortenVenueBlock,
} from "./venue-blocks";

const VENUE_ID = "f3000000-0000-4000-8000-000000000010";

const values: VenueBlockFormValues = {
  venueId: VENUE_ID,
  reasonCategory: "maintenance",
  reason: "  Air-conditioning repair  ",
  startsAt: "2099-04-06T12:00",
  endsAt: "2099-04-06T14:00",
};

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("listVenueBlocks", () => {
  // SPM-83 AC01: the category is read back with each block.
  it("maps each block with its reason category", async () => {
    const query = queryBuilder({
      data: [
        {
          id: "block-1",
          venue_id: VENUE_ID,
          reason_category: "safety",
          reason: "Fire inspection",
          starts_at: "2099-04-06T04:00:00Z",
          ends_at: "2099-04-06T06:00:00Z",
          removed_at: null,
          removed_by: null,
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(listVenueBlocks(VENUE_ID)).resolves.toEqual([
      {
        id: "block-1",
        venueId: VENUE_ID,
        reasonCategory: "safety",
        reason: "Fire inspection",
        startsAt: "2099-04-06T04:00:00Z",
        endsAt: "2099-04-06T06:00:00Z",
        removedAt: null,
        removedBy: null,
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("venue_unavailability");
    expect(query.eq).toHaveBeenCalledWith("venue_id", VENUE_ID);
  });

  it("explains when the history cannot be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listVenueBlocks(VENUE_ID)).rejects.toThrow("We couldn't load this venue's block history.");
  });
});

describe("previewVenueBlockImpact", () => {
  it("sends the period as Singapore-local instants and maps the affected bookings", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          booking_id: "booking-1",
          event_id: "event-1",
          event_title: "Career Fair",
          coordinator_id: "coord-1",
          coordinator_name: "Priya Coordinator",
          venue_name: "Auditorium",
          status: "approved",
          starts_at: "2099-04-06T02:00:00Z",
          ends_at: "2099-04-06T04:00:00Z",
        },
      ],
      error: null,
    });

    const affected = await previewVenueBlockImpact(values);

    expect(rpcMock).toHaveBeenCalledWith("preview_venue_block_impact", {
      p_venue_id: VENUE_ID,
      p_starts_at: "2099-04-06T04:00:00.000Z",
      p_ends_at: "2099-04-06T06:00:00.000Z",
    });
    expect(affected).toEqual([
      {
        bookingId: "booking-1",
        eventId: "event-1",
        eventTitle: "Career Fair",
        coordinatorId: "coord-1",
        coordinatorName: "Priya Coordinator",
        venueName: "Auditorium",
        status: "approved",
        startsAt: "2099-04-06T02:00:00Z",
        endsAt: "2099-04-06T04:00:00Z",
      },
    ]);
  });

  it("returns an empty list when nothing overlaps", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(previewVenueBlockImpact(values)).resolves.toEqual([]);
  });

  it("surfaces the database's message", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Only Venue Staff can preview a block" } });

    await expect(previewVenueBlockImpact(values)).rejects.toThrow("Only Venue Staff can preview a block");
  });
});

describe("createVenueBlock", () => {
  // SPM-83 AC01/AC02: category and description are sent; overlapping bookings come back.
  it("sends the category and trimmed description and returns the affected bookings", async () => {
    const affected = [
      {
        bookingId: "booking-1",
        eventId: "event-1",
        eventTitle: "Career Fair",
        coordinatorId: "coord-1",
        coordinatorName: "Priya Coordinator",
        status: "approved",
        startsAt: "2099-04-06T02:00:00Z",
        endsAt: "2099-04-06T04:00:00Z",
      },
    ];
    rpcMock.mockResolvedValue({ data: { blockId: "block-9", affected }, error: null });

    await expect(createVenueBlock(values)).resolves.toEqual({ blockId: "block-9", affected });
    expect(rpcMock).toHaveBeenCalledWith("create_venue_block", {
      p_venue_id: VENUE_ID,
      p_reason: "Air-conditioning repair",
      p_reason_category: "maintenance",
      p_starts_at: "2099-04-06T04:00:00.000Z",
      p_ends_at: "2099-04-06T06:00:00.000Z",
    });
  });

  it("rejects an unknown category before calling the database", async () => {
    await expect(
      createVenueBlock({ ...values, reasonCategory: "flood" as unknown as VenueBlockFormValues["reasonCategory"] }),
    ).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("surfaces the database's message", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Venue not found" } });

    await expect(createVenueBlock(values)).rejects.toThrow("Venue not found");
  });
});

describe("shortenVenueBlock", () => {
  it("sends the new period and returns how many bookings were cleared", async () => {
    rpcMock.mockResolvedValue({ data: { blockId: "block-1", clearedCount: 2 }, error: null });

    await expect(shortenVenueBlock("block-1", "2099-04-06T13:00", "2099-04-06T14:00")).resolves.toEqual({
      clearedCount: 2,
    });
    expect(rpcMock).toHaveBeenCalledWith("update_venue_block", {
      p_block_id: "block-1",
      p_starts_at: "2099-04-06T05:00:00.000Z",
      p_ends_at: "2099-04-06T06:00:00.000Z",
    });
  });

  it("surfaces the database's message", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "A block can only be shortened" } });

    await expect(shortenVenueBlock("block-1", "2099-04-06T11:00", "2099-04-06T14:00")).rejects.toThrow(
      "A block can only be shortened",
    );
  });
});

describe("removeVenueBlock", () => {
  it("removes the block by id", async () => {
    rpcMock.mockResolvedValue({ data: "block-1", error: null });

    await removeVenueBlock("block-1");

    expect(rpcMock).toHaveBeenCalledWith("remove_venue_block", { p_block_id: "block-1" });
  });

  it("surfaces the database's message", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "Past blocks cannot be removed" } });

    await expect(removeVenueBlock("block-1")).rejects.toThrow("Past blocks cannot be removed");
  });
});
