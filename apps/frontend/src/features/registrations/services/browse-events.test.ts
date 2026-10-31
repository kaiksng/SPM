import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder, type QueryBuilderMock } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock, rpc: rpcMock },
}));

import { listBrowseEvents } from "./browse-events";

const ATTENDEE_ID = "attendee-1";

function eventRow(id: string, registration: Record<string, unknown> = {}) {
  return {
    id,
    title: "Career Fair",
    starts_at: "2026-11-20T01:00:00Z",
    ends_at: "2026-11-20T09:00:00Z",
    event_venue_requirements: { preferred_location: "Auditorium" },
    event_registration_requirements: {
      registration_required: true,
      registration_opens_at: null,
      registration_closes_at: null,
      attendee_capacity: 50,
      ...registration,
    },
  };
}

/**
 * listBrowseEvents reads the confirmed events, then the attendee's own
 * registration rows, and gets counts from event_registration_counts.
 */
function given(
  events: unknown[],
  ownRows: unknown[] = [],
  counts: { event_id: string; registered_count: number; own_waitlist_position: number | null }[] = [],
) {
  const eventsQuery = queryBuilder({ data: events, error: null });
  const ownQuery = queryBuilder({ data: ownRows, error: null });
  fromMock.mockImplementation((table: string) => (table === "events" ? eventsQuery : ownQuery));
  rpcMock.mockResolvedValue({ data: counts, error: null });
  return { eventsQuery, ownQuery: ownQuery as QueryBuilderMock };
}

describe("listBrowseEvents", () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it("marks an event with remaining capacity and no prior registration as open", async () => {
    given([eventRow("event-1")], [], [{ event_id: "event-1", registered_count: 0, own_waitlist_position: null }]);

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events).toEqual([
      expect.objectContaining({ id: "event-1", state: "open", registeredCount: 0, capacity: 50 }),
    ]);
  });

  // Events that don't take registrations are listed too, without a filter on
  // registration_required, and carry no registration details.
  it("lists an event that doesn't take registrations as not needing it", async () => {
    const { eventsQuery } = given(
      [eventRow("event-2", { registration_required: false, attendee_capacity: 80 })],
      [],
      [{ event_id: "event-2", registered_count: 0, own_waitlist_position: null }],
    );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events).toEqual([expect.objectContaining({ id: "event-2", state: "not_required", capacity: null })]);
    expect(eventsQuery.eq).toHaveBeenCalledWith("status", "confirmed");
    expect(eventsQuery.eq).not.toHaveBeenCalledWith("event_registration_requirements.registration_required", true);
  });

  it("marks an event as full once registered count reaches capacity", async () => {
    given(
      [eventRow("event-2", { attendee_capacity: 1 })],
      [],
      [{ event_id: "event-2", registered_count: 1, own_waitlist_position: null }],
    );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events[0]).toEqual(expect.objectContaining({ state: "full", registeredCount: 1 }));
  });

  it("marks an event the attendee already registered for as registered, regardless of capacity", async () => {
    given(
      [eventRow("event-3", { attendee_capacity: 1 })],
      [{ event_id: "event-3", status: "registered" }],
      [{ event_id: "event-3", registered_count: 1, own_waitlist_position: null }],
    );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events[0]?.state).toBe("registered");
  });

  it("includes the attendee's own waiting-list position", async () => {
    given(
      [eventRow("event-4", { attendee_capacity: 1, waitlist_enabled: true })],
      [{ event_id: "event-4", status: "waitlisted" }],
      [{ event_id: "event-4", registered_count: 1, own_waitlist_position: 2 }],
    );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events[0]).toEqual(
      expect.objectContaining({ state: "waitlisted", waitlistEnabled: true, waitlistPosition: 2 }),
    );
  });

  it("treats a withdrawn row as no registration at all", async () => {
    given(
      [eventRow("event-6")],
      [{ event_id: "event-6", status: "withdrawn" }],
      [{ event_id: "event-6", registered_count: 10, own_waitlist_position: null }],
    );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events[0]?.state).toBe("open");
  });

  // SPM-44: an attendee reads only their own registration rows; other
  // attendees are counted by the database, never returned.
  it("reads only the attendee's own registration rows and gets counts from the database", async () => {
    const { ownQuery } = given(
      [eventRow("event-1"), eventRow("event-2")],
      [],
      [
        { event_id: "event-1", registered_count: 12, own_waitlist_position: null },
        { event_id: "event-2", registered_count: 3, own_waitlist_position: null },
      ],
    );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(fromMock).toHaveBeenCalledWith("event_registrations");
    expect(ownQuery.select).toHaveBeenCalledWith("event_id, status");
    expect(ownQuery.eq).toHaveBeenCalledWith("attendee_id", ATTENDEE_ID);
    expect(rpcMock).toHaveBeenCalledWith("event_registration_counts", { p_event_ids: ["event-1", "event-2"] });
    expect(events.map((event) => event.registeredCount)).toEqual([12, 3]);
  });

  it("returns an empty list without a second query when there are no events", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: [], error: null }));

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("throws a friendly error when the events query fails", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listBrowseEvents(ATTENDEE_ID)).rejects.toThrow("We couldn't load events.");
  });

  it("throws a friendly error when the counts cannot be read", async () => {
    given([eventRow("event-1")]);
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(listBrowseEvents(ATTENDEE_ID)).rejects.toThrow("We couldn't load events.");
  });
});
