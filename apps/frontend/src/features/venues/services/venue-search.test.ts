import type { VenueSearchValues } from "@spm/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { searchAvailableVenues } from "./venue-search";

const values: VenueSearchValues = {
  startsAt: "2099-04-06T10:00",
  endsAt: "2099-04-06T12:00",
  minimumCapacity: "40",
  location: "  Bugis  ",
  layout: "Theatre",
  facilities: ["Projector"],
  accessibility: "  wheelchair  ",
};

const row = {
  id: "venue-1",
  name: "Conference Room A",
  location: "Bugis",
  capacity: 50,
  operating_hours: [{ days: ["mon"], opensAt: "08:00", closesAt: "18:00" }],
  description: "Bright room",
  accessibility_notes: "Step-free",
  facilities: ["Projector"],
  layouts: ["Theatre"],
  updated_at: "2026-09-20T00:00:00.000Z",
  setup_time_minutes: 30,
  turnaround_time_minutes: 15,
};

beforeEach(() => {
  rpcMock.mockReset();
});

describe("searchAvailableVenues", () => {
  // SPM-21 AC: results are for the searched period, in Singapore time, and every specified filter is sent.
  it("sends the period as Singapore time and every specified filter", async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    await searchAvailableVenues("event-1", values);

    expect(rpcMock).toHaveBeenCalledWith("search_available_venues", {
      p_event_id: "event-1",
      p_starts_at: "2099-04-06T02:00:00.000Z",
      p_ends_at: "2099-04-06T04:00:00.000Z",
      p_min_capacity: 40,
      p_location: "Bugis",
      p_layout: "Theatre",
      p_facilities: ["Projector"],
      p_accessibility: "wheelchair",
    });
  });

  // SPM-21 AC: unspecified optional filters do not restrict results.
  it("omits blank optional filters so they do not restrict the search", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await searchAvailableVenues("event-1", { ...values, location: "  ", layout: "", facilities: [], accessibility: "" });

    const args = rpcMock.mock.calls[0]?.[1] ?? {};
    expect(args.p_location).toBeUndefined();
    expect(args.p_layout).toBeUndefined();
    expect(args.p_accessibility).toBeUndefined();
    expect(args.p_facilities).toEqual([]);
  });

  // SPM-21 AC: each result shows the details relevant to suitability and its availability.
  it("maps each result to a venue summary marked available", async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    await expect(searchAvailableVenues("event-1", values)).resolves.toEqual([
      {
        id: "venue-1",
        name: "Conference Room A",
        location: "Bugis",
        areaTags: [],
        capacity: 50,
        operatingHours: [{ days: ["mon"], opensAt: "08:00", closesAt: "18:00" }],
        description: "Bright room",
        accessibilityNotes: "Step-free",
        facilities: ["Projector"],
        layouts: ["Theatre"],
        imageUrl: null,
        updatedAt: "2026-09-20T00:00:00.000Z",
        updatedByName: null,
        needsReviewCount: 0,
        availabilityStatus: "available",
        setupTimeMinutes: 30,
        turnaroundTimeMinutes: 15,
      },
    ]);
  });

  it("returns an empty list when no venue matches", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await expect(searchAvailableVenues("event-1", values)).resolves.toEqual([]);
  });

  it("throws the database message when the search fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "search unavailable" } });

    await expect(searchAvailableVenues("event-1", values)).rejects.toThrow("search unavailable");
  });

  // SPM-21 AC: a valid period and a positive capacity are required.
  it("rejects invalid input before calling the database", async () => {
    await expect(searchAvailableVenues("event-1", { ...values, minimumCapacity: "0" })).rejects.toThrow();
    await expect(searchAvailableVenues("event-1", { ...values, endsAt: values.startsAt })).rejects.toThrow();

    expect(rpcMock).not.toHaveBeenCalled();
  });
});
