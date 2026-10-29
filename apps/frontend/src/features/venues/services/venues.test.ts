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

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: apiFetchMock };
});

import { ApiError } from "@/lib/api-client";

import {
  createVenue,
  getVenue,
  listAtRiskBookings,
  listFlaggedBookingConflicts,
  listVenueBufferTimeChanges,
  listSuggestedVenues,
  listVenues,
  recheckAllVenueConflicts,
  recheckVenueConflicts,
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
    layouts: ["Theatre"],
    description: "",
    accessibilityNotes: "Ramp",
    imageUrl: "",
    setupTimeMinutes: "0",
    turnaroundTimeMinutes: "0",
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
  layouts: ["Theatre"],
  image_url: null,
  setup_time_minutes: 0,
  turnaround_time_minutes: 0,
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
  it("calls the backend's update route with the venue id and payload, returning the flagged-booking count", async () => {
    apiFetchMock.mockResolvedValue({
      data: { venueId: "venue-1", flaggedBookingsCount: 2 },
    });

    await expect(updateVenue("venue-1", validValues())).resolves.toEqual({
      venueId: "venue-1",
      flaggedBookingsCount: 2,
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/venues/venue-1/update", {
      method: "POST",
      body: JSON.stringify({ venue: EXPECTED_PAYLOAD }),
    });
  });

  it("rejects invalid values before calling the backend", async () => {
    await expect(updateVenue("venue-1", validValues({ layouts: [] }))).rejects.toThrow();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

// mapVenueRpcError is private — exercised through createVenue's direct
// supabase.rpc path (create_venue never notifies anyone, so it stays
// direct — see the comment on updateVenue above).
describe("createVenue database error mapping", () => {
  async function saveWithError(error: Record<string, unknown>) {
    rpcMock.mockResolvedValue({ data: null, error });
    const thrown = await createVenue(validValues()).catch((caught: unknown) => caught);
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

// updateVenue's counterpart: apps/backend's mapVenueError already does the
// 23505/23514/42501/22P02 -> ApplicationError translation server-side, so
// this only exercises mapVenueApiError reshaping an ApiError (whatever the
// backend sent) into the same EventSubmissionError/fieldErrors shape
// VenueForm expects — not re-testing the backend's own mapping.
describe("updateVenue database error mapping", () => {
  async function saveWithError(error: unknown) {
    apiFetchMock.mockRejectedValue(error);
    const thrown = await updateVenue("venue-1", validValues()).catch((caught: unknown) => caught);
    expect(thrown).toBeInstanceOf(EventSubmissionError);
    return thrown as EventSubmissionError;
  }

  it("maps a field-level ApiError onto that field", async () => {
    const error = await saveWithError(
      new ApiError("A venue with this name already exists at this location", 422, [
        { field: "name", message: "A venue with this name already exists at this location" },
      ]),
    );

    expect(error.message).toBe("A venue with this name already exists at this location");
    expect(error.fieldErrors).toEqual({
      name: "A venue with this name already exists at this location",
    });
  });

  it("maps several field issues onto every listed field", async () => {
    const error = await saveWithError(
      new ApiError("Check the highlighted fields and try again.", 422, [
        { field: "capacity", message: "Capacity must be positive" },
        { field: "facilities", message: "Add at least one facility" },
      ]),
    );

    expect(error.message).toBe("Check the highlighted fields and try again.");
    expect(error.fieldErrors).toEqual({
      capacity: "Capacity must be positive",
      facilities: "Add at least one facility",
    });
  });

  it("surfaces the backend's own message when there are no field issues", async () => {
    const error = await saveWithError(new ApiError("Only venue staff can manage venues", 403));

    expect(error.message).toBe("Only venue staff can manage venues");
    expect(error.fieldErrors).toBeUndefined();
  });

  it("falls back to a generic message for a non-ApiError failure", async () => {
    const error = await saveWithError(new TypeError("network error"));

    expect(error.message).toBe("network error");
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
    setup_time_minutes: 15,
    turnaround_time_minutes: 30,
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
      imageUrl: "",
      updatedAt: "2026-09-25T06:20:00Z",
      updatedByName: "Daryl",
      setupTimeMinutes: "15",
      turnaroundTimeMinutes: "30",
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
    setup_time_minutes: 15,
    turnaround_time_minutes: 30,
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
        setupTimeMinutes: 15,
        turnaroundTimeMinutes: 30,
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
        imageUrl: null,
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
  // SPM-24 AC01 + AC07: a requested period reads as "Pending Booking".
  it("labels all four availability states", () => {
    expect(VENUE_AVAILABILITY_LABELS).toEqual({
      available: "Available",
      pending: "Pending Booking",
      confirmed: "Confirmed",
      blocked: "Blocked",
    });
  });
});

describe("listFlaggedBookingConflicts", () => {
  const bookingConflictRow = {
    id: 7,
    cause: "setup_time_changed",
    is_responsible: true,
    flagged_at: "2026-10-09T02:00:00Z",
    booking: {
      id: "booking-1",
      starts_at: "2026-10-20T01:00:00Z",
      ends_at: "2026-10-20T03:00:00Z",
      event_id: "event-1",
      events: { title: "Leadership Summit", coordinator: { full_name: "Joyce" } },
      venues: {
        id: "venue-1",
        name: "Innovation Hall",
        venue_layouts: [{ layout_name: "Theatre" }, { layout_name: "Banquet" }],
      },
    },
    conflicting_booking: { events: { title: "Orientation Night" } },
    conflicting_block: null,
  };

  it("reads only unresolved conflicts, newest first, and maps a booking-vs-booking conflict", async () => {
    const query = queryBuilder({ data: [bookingConflictRow], error: null });
    fromMock.mockReturnValue(query);

    await expect(listFlaggedBookingConflicts()).resolves.toEqual([
      {
        id: 7,
        bookingId: "booking-1",
        eventId: "event-1",
        eventTitle: "Leadership Summit",
        venueId: "venue-1",
        venueName: "Innovation Hall",
        venueLayouts: ["Theatre", "Banquet"],
        startsAt: "2026-10-20T01:00:00Z",
        endsAt: "2026-10-20T03:00:00Z",
        coordinatorName: "Joyce",
        isResponsible: true,
        cause: "setup_time_changed",
        flaggedAt: "2026-10-09T02:00:00Z",
        conflictingEventTitle: "Orientation Night",
        conflictingBlockReason: null,
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("venue_booking_conflicts");
    expect(query.is).toHaveBeenCalledWith("resolved_at", null);
    expect(query.order).toHaveBeenCalledWith("flagged_at", { ascending: false });
  });

  it("maps a booking-vs-block conflict to the block's reason", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            ...bookingConflictRow,
            conflicting_booking: null,
            conflicting_block: { reason: "Annual maintenance" },
          },
        ],
        error: null,
      }),
    );

    const [conflict] = await listFlaggedBookingConflicts();

    expect(conflict?.conflictingEventTitle).toBeNull();
    expect(conflict?.conflictingBlockReason).toBe("Annual maintenance");
  });

  it("falls back to readable placeholders when related rows are missing", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            ...bookingConflictRow,
            is_responsible: false,
            booking: { ...bookingConflictRow.booking, events: null, venues: null },
            conflicting_booking: { events: null },
            conflicting_block: { reason: null },
          },
        ],
        error: null,
      }),
    );

    const [conflict] = await listFlaggedBookingConflicts();

    expect(conflict).toMatchObject({
      eventTitle: "Unknown event",
      venueId: "",
      venueName: "Unknown venue",
      venueLayouts: [],
      coordinatorName: null,
      isResponsible: false,
      conflictingEventTitle: null,
      conflictingBlockReason: null,
    });
  });

  it("reports no coordinator when the event has none assigned", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            ...bookingConflictRow,
            booking: {
              ...bookingConflictRow.booking,
              events: { title: "Leadership Summit", coordinator: null },
            },
          },
        ],
        error: null,
      }),
    );

    const [conflict] = await listFlaggedBookingConflicts();

    expect(conflict?.coordinatorName).toBeNull();
  });

  it("skips a conflict whose booking is not visible", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: [{ ...bookingConflictRow, booking: null }, bookingConflictRow], error: null }),
    );

    const conflicts = await listFlaggedBookingConflicts();

    expect(conflicts.map((conflict) => conflict.id)).toEqual([7]);
  });

  it("returns an empty list when the query returns no data", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(listFlaggedBookingConflicts()).resolves.toEqual([]);
  });

  it("throws a friendly error when the query fails", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listFlaggedBookingConflicts()).rejects.toThrow("Flagged bookings are unavailable.");
  });
});

describe("recheckVenueConflicts", () => {
  it("asks the backend to re-check one venue and returns the counts", async () => {
    const counts = { venueId: "venue-1", flaggedCount: 2, clearedCount: 1, activeCount: 3 };
    apiFetchMock.mockResolvedValue({ data: counts });

    await expect(recheckVenueConflicts("venue-1")).resolves.toEqual(counts);
    expect(apiFetchMock).toHaveBeenCalledWith("/venues/venue-1/recheck-conflicts", {
      method: "POST",
    });
  });

  it("passes a backend failure through to the caller", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("Only venue staff can re-check venue conflicts", 403));

    await expect(recheckVenueConflicts("venue-1")).rejects.toThrow(
      "Only venue staff can re-check venue conflicts",
    );
  });
});

describe("recheckAllVenueConflicts", () => {
  it("asks the backend to re-check every venue and returns the counts", async () => {
    apiFetchMock.mockResolvedValue({ data: { flaggedCount: 4, clearedCount: 2 } });

    await expect(recheckAllVenueConflicts()).resolves.toEqual({ flaggedCount: 4, clearedCount: 2 });
    expect(apiFetchMock).toHaveBeenCalledWith("/venues/recheck-conflicts", { method: "POST" });
  });

  it("passes a backend failure through to the caller", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("Request failed with status 500", 500));

    await expect(recheckAllVenueConflicts()).rejects.toThrow("Request failed with status 500");
  });
});

// SPM-86 AC04: each setup/turnaround change records who, what it was, what it became, and when.
describe("listVenueBufferTimeChanges", () => {
  it("returns the changes newest first, with the staff member, the old and new value and the time", async () => {
    const query = queryBuilder({
      data: [
        { id: 2, field_name: "turnaround_time_minutes", previous_value: 0, new_value: 30, changed_at: "2026-10-01T02:00:00Z", changed_by: { full_name: "Sam Staff" } },
        { id: 1, field_name: "setup_time_minutes", previous_value: 5, new_value: 15, changed_at: "2026-09-30T02:00:00Z", changed_by: null },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(listVenueBufferTimeChanges("venue-1")).resolves.toEqual([
      { id: 2, field: "turnaround_time_minutes", previousValue: 0, newValue: 30, changedByName: "Sam Staff", changedAt: "2026-10-01T02:00:00Z" },
      { id: 1, field: "setup_time_minutes", previousValue: 5, newValue: 15, changedByName: null, changedAt: "2026-09-30T02:00:00Z" },
    ]);
    expect(fromMock).toHaveBeenCalledWith("venue_buffer_time_changes");
    expect(query.eq).toHaveBeenCalledWith("venue_id", "venue-1");
    expect(query.order).toHaveBeenCalledWith("changed_at", { ascending: false });
  });

  it("returns an empty history when nothing was ever changed", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(listVenueBufferTimeChanges("venue-1")).resolves.toEqual([]);
  });

  // SPM-86 AC05: only Venue Staff can read the history; anyone else's read is refused.
  it("says the history is unavailable when the read is refused", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { code: "42501", message: "denied" } }));

    await expect(listVenueBufferTimeChanges("venue-1")).rejects.toThrow("This venue's change history is unavailable.");
  });
});

