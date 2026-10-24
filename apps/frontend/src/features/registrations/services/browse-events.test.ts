import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock },
}));

import { listBrowseEvents } from "./browse-events";

const ATTENDEE_ID = "attendee-1";

describe("listBrowseEvents", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("marks an event with remaining capacity and no prior registration as open", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            {
              id: "event-1",
              title: "AI Innovation Summit",
              starts_at: "2026-11-12T02:00:00Z",
              ends_at: "2026-11-12T08:00:00Z",
              event_venue_requirements: { preferred_location: "Auditorium" },
              event_registration_requirements: {
                registration_required: true,
                registration_opens_at: null,
                registration_closes_at: null,
                attendee_capacity: 50,
              },
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(queryBuilder({ data: [], error: null }));

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events).toEqual([
      expect.objectContaining({
        id: "event-1",
        state: "open",
        registeredCount: 0,
        capacity: 50,
      }),
    ]);
  });

  it("marks an event as full once registered count reaches capacity", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            {
              id: "event-2",
              title: "Career Fair",
              starts_at: "2026-11-20T01:00:00Z",
              ends_at: "2026-11-20T09:00:00Z",
              event_venue_requirements: null,
              event_registration_requirements: {
                registration_required: true,
                registration_opens_at: null,
                registration_closes_at: null,
                attendee_capacity: 1,
              },
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        queryBuilder({
          data: [{ event_id: "event-2", attendee_id: "someone-else", status: "registered" }],
          error: null,
        }),
      );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(expect.objectContaining({ state: "full", registeredCount: 1 }));
  });

  it("marks an event the attendee already registered for as registered, regardless of capacity", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            {
              id: "event-3",
              title: "Robotics Showcase",
              starts_at: "2026-11-28T03:00:00Z",
              ends_at: "2026-11-28T07:00:00Z",
              event_venue_requirements: { preferred_location: "Exhibition Hall" },
              event_registration_requirements: {
                registration_required: true,
                registration_opens_at: null,
                registration_closes_at: null,
                attendee_capacity: 120,
              },
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        queryBuilder({
          data: [{ event_id: "event-3", attendee_id: ATTENDEE_ID, status: "registered" }],
          error: null,
        }),
      );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events[0]?.state).toBe("registered");
  });

  it("includes the attendee's own waiting-list position among their peers", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            {
              id: "event-4",
              title: "Founders Fireside Chat",
              starts_at: "2026-12-02T10:00:00Z",
              ends_at: "2026-12-02T12:00:00Z",
              event_venue_requirements: null,
              event_registration_requirements: {
                registration_required: true,
                registration_opens_at: null,
                registration_closes_at: null,
                attendee_capacity: 1,
                waitlist_enabled: true,
              },
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            { event_id: "event-4", attendee_id: "someone-else", status: "waitlisted" },
            { event_id: "event-4", attendee_id: ATTENDEE_ID, status: "waitlisted" },
          ],
          error: null,
        }),
      );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events[0]).toEqual(
      expect.objectContaining({ state: "waitlisted", waitlistEnabled: true, waitlistPosition: 2 }),
    );
  });

  it("treats a withdrawn row as no registration at all", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            {
              id: "event-6",
              title: "Career Fair",
              starts_at: "2026-11-20T01:00:00Z",
              ends_at: "2026-11-20T09:00:00Z",
              event_venue_requirements: null,
              event_registration_requirements: {
                registration_required: true,
                registration_opens_at: null,
                registration_closes_at: null,
                attendee_capacity: 50,
              },
            },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(
        queryBuilder({
          data: [{ event_id: "event-6", attendee_id: ATTENDEE_ID, status: "withdrawn" }],
          error: null,
        }),
      );

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events[0]?.state).toBe("open");
  });

  it("returns an empty list without a second query when there are no events", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: [], error: null }));

    const events = await listBrowseEvents(ATTENDEE_ID);

    expect(events).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });

  it("throws a friendly error when the events query fails", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: { message: "boom" } }));

    await expect(listBrowseEvents(ATTENDEE_ID)).rejects.toThrow("We couldn't load events.");
  });
});
