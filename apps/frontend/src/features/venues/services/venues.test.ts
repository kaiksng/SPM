import { EventSubmissionError, type VenueFormValues } from "@spm/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import {
  createVenue,
  getVenue,
  listAtRiskBookings,
  listSuggestedVenues,
  listVenues,
  updateVenue,
  VENUE_AVAILABILITY_LABELS,
} from "./venues";

const HOURS = [{ days: ["mon", "tue"], opensAt: "09:00", closesAt: "18:00" }];

function validValues(overrides: Partial<VenueFormValues> = {}): VenueFormValues {
  return {
    name: " Innovation Hall ",
    location: "Block A",
    areaTags: ["Central Area"],
    capacity: "120",
    operatingHours: [{ days: ["mon", "tue"], opensAt: "09:00", closesAt: "18:00" }],
    facilities: ["Projector"],
    layouts: ["Theatre", "Banquet"],
    description: "",
    accessibilityNotes: "Ramp",
    ...overrides,
  };
}

const EXPECTED_PAYLOAD = {
  name: "Innovation Hall",
  location: "Block A",
  area_tags: ["Central Area"],
  capacity: 120,
  operating_hours: HOURS,
  description: null,
  accessibility_notes: "Ramp",
  facilities: ["Projector"],
  layouts: ["Theatre", "Banquet"],
};

beforeEach(() => {
  fromMock.mockReset();
  fromMock.mockReturnValue(queryBuilder({ data: [], error: null }));
  rpcMock.mockReset();
  apiFetchMock.mockReset();
});

describe("createVenue", () => {
  it("calls create_venue with the converted payload and returns the new id", async () => {
    rpcMock.mockResolvedValue({ data: { venueId: "venue-1" }, error: null });

    await expect(createVenue(validValues())).resolves.toEqual({ venueId: "venue-1" });
    expect(rpcMock).toHaveBeenCalledWith("create_venue", { p_venue: EXPECTED_PAYLOAD });
  });

  it("rejects invalid values before calling the database", async () => {
    await expect(createVenue(validValues({ capacity: "0" }))).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does not claim a venue area was saved before the migration exists", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { code: "42703", message: "column venues.area_tags does not exist" } }));

    await expect(createVenue(validValues())).rejects.toThrow("Venue area tags are not available yet");
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("updateVenue", () => {
  it("calls update_venue with the venue id and payload, returning the flagged-booking count", async () => {
    rpcMock.mockResolvedValue({
      data: { venueId: "venue-1", flaggedBookingsCount: 2 },
      error: null,
    });

    await expect(updateVenue("venue-1", validValues())).resolves.toEqual({
      venueId: "venue-1",
      flaggedBookingsCount: 2,
    });
    expect(rpcMock).toHaveBeenCalledWith("update_venue", {
      p_venue_id: "venue-1",
      p_venue: EXPECTED_PAYLOAD,
    });
  });

  it("rejects invalid values before calling the database", async () => {
    await expect(updateVenue("venue-1", validValues({ layouts: [] }))).rejects.toThrow();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

// mapVenueRpcError is private — exercised through both write paths.
describe.each([
  ["createVenue", () => createVenue(validValues())],
  ["updateVenue", () => updateVenue("venue-1", validValues())],
])("%s database error mapping", (_name, save) => {
  async function saveWithError(error: Record<string, unknown>) {
    rpcMock.mockResolvedValue({ data: null, error });
    const thrown = await save().catch((caught: unknown) => caught);
    expect(thrown).toBeInstanceOf(EventSubmissionError);
    return thrown as EventSubmissionError;
  }

  const GENERIC = "This venue could not be saved. Your form values are still here.";

  // AC: a venue's name + location must be unique.
  it("maps 23505 with a field issue onto that field", async () => {
    const error = await saveWithError({
      code: "23505",
      message: "duplicate key",
      details: JSON.stringify({
        field: "name",
        message: "A venue with this name already exists at this location",
      }),
    });

    expect(error.message).toBe("A venue with this name already exists at this location");
    expect(error.fieldErrors).toEqual({
      name: "A venue with this name already exists at this location",
    });
  });

  it.each([
    ["no details", undefined],
    ["null details", null],
    ["details that are not JSON", "Key (name)=(x) already exists"],
    ["JSON null", "null"],
    ["an issue with no field", JSON.stringify({ message: "Duplicate" })],
    ["an issue with no message", JSON.stringify({ field: "name" })],
  ])("falls back to the generic message for 23505 with %s", async (_label, details) => {
    const error = await saveWithError({ code: "23505", message: "duplicate key", details });

    expect(error.message).toBe(GENERIC);
    expect(error.fieldErrors).toBeUndefined();
  });

  it("maps 23514 with an issue list onto every listed field", async () => {
    const error = await saveWithError({
      code: "23514",
      message: "check violation",
      details: JSON.stringify([
        { field: "capacity", message: "Capacity must be positive" },
        { field: "facilities", message: "Add at least one facility" },
      ]),
    });

    expect(error.message).toBe("Check the highlighted fields and try again.");
    expect(error.fieldErrors).toEqual({
      capacity: "Capacity must be positive",
      facilities: "Add at least one facility",
    });
  });

  it("falls back to the generic message for 23514 without an issue list", async () => {
    const error = await saveWithError({
      code: "23514",
      message: "check violation",
      details: JSON.stringify({ field: "capacity" }),
    });

    expect(error.message).toBe(GENERIC);
    expect(error.fieldErrors).toBeUndefined();
  });

  it("surfaces the database's own message for 42501", async () => {
    const error = await saveWithError({
      code: "42501",
      message: "Only venue staff can manage venues",
    });

    expect(error.message).toBe("Only venue staff can manage venues");
    expect(error.fieldErrors).toBeUndefined();
  });

  it("uses the generic message for any other database error", async () => {
    const error = await saveWithError({ code: "XX000", message: "connection reset" });

    expect(error.message).toBe(GENERIC);
  });

  it("explains when custom layouts need the database migration", async () => {
    const error = await saveWithError({ code: "22P02", message: 'invalid input value for enum room_layout: "U-shape"' });
    expect(error.message).toContain("Custom room layouts are not available yet");
  });
});

describe("getVenue", () => {
  const row = {
    name: "Innovation Hall",
    location: "Block A",
    area_tags: ["Central Area"],
    capacity: 120,
    operating_hours: HOURS,
    description: "Big room",
    accessibility_notes: "Ramp",
    updated_at: "2026-09-25T06:20:00Z",
    updated_by_profile: { full_name: "Daryl" },
    venue_facilities: [{ facility_name: "Projector" }, { facility_name: "Stage" }],
    venue_layouts: [{ layout_name: "Theatre" }],
  };

  it("maps the stored venue into form values for the edit form", async () => {
    const query = queryBuilder({ data: row, error: null });
    fromMock.mockReturnValue(query);

    await expect(getVenue("venue-1")).resolves.toEqual({
      name: "Innovation Hall",
      location: "Block A",
      areaTags: ["Central Area"],
      capacity: "120",
      operatingHours: HOURS,
      description: "Big room",
      accessibilityNotes: "Ramp",
      facilities: ["Projector", "Stage"],
      layouts: ["Theatre"],
      updatedAt: "2026-09-25T06:20:00Z",
      updatedByName: "Daryl",
    });
    expect(fromMock).toHaveBeenCalledWith("venues");
    expect(query.eq).toHaveBeenCalledWith("id", "venue-1");
  });

  it("opens a venue before the area-tag migration is applied", async () => {
    fromMock
      .mockReturnValueOnce(queryBuilder({ data: null, error: { code: "42703", message: "column venues.area_tags does not exist" } }))
      .mockReturnValueOnce(queryBuilder({ data: (({ area_tags: _tags, ...legacy }) => legacy)(row), error: null }));

    await expect(getVenue("venue-1")).resolves.toMatchObject({ areaTags: [], name: "Innovation Hall" });
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("turns null optional text into empty strings and a missing updater into null", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: { ...row, description: null, accessibility_notes: null, updated_by_profile: null },
        error: null,
      }),
    );

    const venue = await getVenue("venue-1");

    expect(venue.description).toBe("");
    expect(venue.accessibilityNotes).toBe("");
    expect(venue.updatedByName).toBeNull();
  });

  it.each([
    ["the query fails", { data: null, error: { message: "boom" } }],
    ["no venue is found", { data: null, error: null }],
  ])("throws a friendly error when %s", async (_label, result) => {
    fromMock.mockReturnValue(queryBuilder(result));

    await expect(getVenue("venue-1")).rejects.toThrow(
      "This venue is unavailable or you do not have access to it.",
    );
  });
});

describe("listAtRiskBookings", () => {
  it("returns approved/pending bookings whose event has an expected attendance", async () => {
    const query = queryBuilder({
      data: [
        {
          id: "booking-1",
          status: "approved",
          event_id: "event-1",
          events: { title: "Summit", expected_attendance: 150 },
        },
        {
          id: "booking-2",
          status: "pending",
          event_id: "event-2",
          events: { title: "No headcount yet", expected_attendance: null },
        },
        { id: "booking-3", status: "pending", event_id: "event-3", events: null },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(listAtRiskBookings("venue-1")).resolves.toEqual([
      {
        id: "booking-1",
        eventId: "event-1",
        eventTitle: "Summit",
        expectedAttendance: 150,
        status: "approved",
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("venue_bookings");
    expect(query.eq).toHaveBeenCalledWith("venue_id", "venue-1");
    expect(query.in).toHaveBeenCalledWith("status", ["approved", "pending"]);
  });

  it("throws a friendly error when the query fails", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listAtRiskBookings("venue-1")).rejects.toThrow(
      "We couldn't check this venue's bookings.",
    );
  });
});

describe("listVenues", () => {
  const row = {
    id: "venue-1",
    name: "Innovation Hall",
    location: "Block A",
    area_tags: ["Central Area"],
    capacity: 120,
    operating_hours: HOURS,
    description: null,
    accessibility_notes: null,
    updated_at: "2026-09-25T06:20:00Z",
    updated_by_profile: { full_name: "Daryl" },
    venue_facilities: [{ facility_name: "Projector" }],
    venue_layouts: [{ layout_name: "Theatre" }, { layout_name: "Banquet" }],
    venue_bookings: [{ needs_review: true }, { needs_review: false }, { needs_review: true }],
  };

  it("maps catalogue rows and counts bookings that need review", async () => {
    const query = queryBuilder({ data: [row], error: null });
    fromMock.mockReturnValue(query);

    await expect(listVenues()).resolves.toEqual([
      {
        id: "venue-1",
        name: "Innovation Hall",
        location: "Block A",
        areaTags: ["Central Area"],
        capacity: 120,
        operatingHours: HOURS,
        description: null,
        accessibilityNotes: null,
        facilities: ["Projector"],
        layouts: ["Theatre", "Banquet"],
        updatedAt: "2026-09-25T06:20:00Z",
        updatedByName: "Daryl",
        needsReviewCount: 2,
      },
    ]);
    expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  it("loads the catalogue before the area-tag migration is applied", async () => {
    fromMock
      .mockReturnValueOnce(queryBuilder({ data: null, error: { code: "42703", message: "column venues.area_tags does not exist" } }))
      .mockReturnValueOnce(queryBuilder({ data: [(({ area_tags: _tags, ...legacy }) => legacy)(row)], error: null }));

    await expect(listVenues()).resolves.toMatchObject([{ areaTags: [], name: "Innovation Hall" }]);
    expect(fromMock).toHaveBeenCalledTimes(2);
  });

  it("reports no updater for a venue nobody has edited", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: [{ ...row, updated_by_profile: null }], error: null }),
    );

    const [venue] = await listVenues();

    expect(venue?.updatedByName).toBeNull();
  });

  it("throws a friendly error when the query fails", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listVenues()).rejects.toThrow("We couldn't load the venue catalogue.");
  });
});

describe("listSuggestedVenues", () => {
  const row = {
    id: "venue-1",
    name: "Innovation Hall",
    location: "Block A",
    capacity: 120,
    operating_hours: HOURS,
    description: "Big room",
    accessibility_notes: null,
    facilities: ["Projector"],
    layouts: ["Theatre"],
    updated_at: "2026-09-25T06:20:00Z",
    availability_status: "pending",
  };

  it("maps suggestions from the backend route into venue summaries", async () => {
    apiFetchMock.mockResolvedValue({ data: [row] });

    await expect(listSuggestedVenues("event-1")).resolves.toEqual([
      {
        id: "venue-1",
        name: "Innovation Hall",
        location: "Block A",
        areaTags: [],
        capacity: 120,
        operatingHours: HOURS,
        description: "Big room",
        accessibilityNotes: null,
        facilities: ["Projector"],
        layouts: ["Theatre"],
        updatedAt: "2026-09-25T06:20:00Z",
        updatedByName: null,
        needsReviewCount: 0,
        availabilityStatus: "pending",
      },
    ]);
    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/suggested-venues");
  });

  it("treats null facilities and layouts as empty lists", async () => {
    apiFetchMock.mockResolvedValue({ data: [{ ...row, facilities: null, layouts: null }] });

    const [venue] = await listSuggestedVenues("event-1");

    expect(venue?.facilities).toEqual([]);
    expect(venue?.layouts).toEqual([]);
  });

  it("returns an empty list when the route returns no data", async () => {
    apiFetchMock.mockResolvedValue({ data: null });

    await expect(listSuggestedVenues("event-1")).resolves.toEqual([]);
  });

  it("throws a friendly error when the route fails", async () => {
    apiFetchMock.mockRejectedValue(new Error("403"));

    await expect(listSuggestedVenues("event-1")).rejects.toThrow(
      "We couldn't load suggested venues for this event.",
    );
  });
});

describe("VENUE_AVAILABILITY_LABELS", () => {
  it("labels all four availability states", () => {
    expect(VENUE_AVAILABILITY_LABELS).toEqual({
      available: "Available",
      pending: "Pending",
      confirmed: "Confirmed",
      blocked: "Blocked",
    });
  });
});
