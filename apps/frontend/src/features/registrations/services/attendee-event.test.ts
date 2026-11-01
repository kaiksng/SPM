import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { loadAttendeeEventDetail } from "./attendee-event";

const row = {
  id: "event-1",
  title: "AI Innovation Summit",
  description: "A full day of talks.",
  starts_at: "2099-11-12T02:00:00Z",
  ends_at: "2099-11-12T08:00:00Z",
  status: "confirmed",
  banner_path: null,
  organiser_name: "Student Life Office",
  preferred_location: "Auditorium",
  registration_required: true,
  registration_opens_at: null,
  registration_closes_at: "2099-11-10T00:00:00Z",
  attendee_capacity: 50,
  waitlist_enabled: true,
  withdrawal_permitted: false,
};

const empty = { data: [], error: null };

/** Answers each RPC by name; any RPC not listed returns no rows. */
function mockRpc(results: Record<string, unknown>) {
  rpcMock.mockImplementation((name: string) => Promise.resolve(results[name] ?? empty));
}

beforeEach(() => {
  rpcMock.mockReset();
  mockRpc({});
});

describe("loadAttendeeEventDetail", () => {
  it("maps the event's public details and registration settings", async () => {
    mockRpc({ attendee_visible_events: { data: [row], error: null } });

    await expect(loadAttendeeEventDetail("event-1")).resolves.toEqual({
      id: "event-1",
      title: "AI Innovation Summit",
      description: "A full day of talks.",
      startsAt: "2099-11-12T02:00:00Z",
      endsAt: "2099-11-12T08:00:00Z",
      status: "confirmed",
      organiserName: "Student Life Office",
      bannerPath: null,
      venue: { preferredLocation: "Auditorium" },
      venues: [],
      registration: {
        required: true,
        opensAt: null,
        closesAt: "2099-11-10T00:00:00Z",
        capacity: 50,
        waitlistEnabled: true,
        withdrawalPermitted: false,
      },
    });
    expect(rpcMock).toHaveBeenCalledWith("attendee_visible_events", { p_event_ids: ["event-1"] });
  });

  // SPM-44 AC05 / SPM-49 AC2: the attendee never reads the events table or any internal field.
  it("reads only through attendee-safe RPCs, never the events table or internal fields", async () => {
    mockRpc({ attendee_visible_events: { data: [row], error: null } });

    const detail = await loadAttendeeEventDetail("event-1");

    const called = rpcMock.mock.calls.map((call) => call[0]);
    expect(called).toEqual(["attendee_visible_events", "attendee_event_venues"]);
    expect(Object.keys(detail).join(" ")).not.toMatch(/equipment|facilit|notes|purpose|attendance|coordinator/i);
  });

  it("falls back to defaults when the event has no venue or registration rows", async () => {
    mockRpc({
      attendee_visible_events: {
        data: [
          {
            ...row,
            organiser_name: null,
            preferred_location: null,
            registration_required: null,
            registration_opens_at: null,
            registration_closes_at: null,
            attendee_capacity: null,
            waitlist_enabled: null,
            withdrawal_permitted: null,
          },
        ],
        error: null,
      },
    });

    await expect(loadAttendeeEventDetail("event-1")).resolves.toMatchObject({
      organiserName: null,
      venue: { preferredLocation: null },
      registration: { required: false, capacity: null, waitlistEnabled: false, withdrawalPermitted: false },
    });
  });

  it.each([
    ["no event is visible", { data: [], error: null }],
    ["the read fails", { data: null, error: { message: "boom" } }],
  ])("throws the access message when %s and the event isn't being updated either", async (_label, result) => {
    mockRpc({ attendee_visible_events: result });

    await expect(loadAttendeeEventDetail("event-1")).rejects.toThrow(
      "This event is unavailable or you do not have access to it.",
    );
  });
});

// An event the attendee can't see as an ordinary event may be a Confirmed
// event back under review: its attendee-safe details still load.
describe("an event being updated", () => {
  it("loads its attendee-safe details when the event isn't visible as an ordinary event", async () => {
    mockRpc({
      attendee_events_being_updated: {
        data: [
          {
            id: "event-9",
            title: "Updating Gala",
            description: "An evening gala.",
            starts_at: "2099-12-01T02:00:00Z",
            ends_at: "2099-12-01T06:00:00Z",
            location: "Marina Bay",
            banner_path: null,
            registration_required: true,
            withdrawal_permitted: true,
          },
        ],
        error: null,
      },
    });

    const detail = await loadAttendeeEventDetail("event-9");

    expect(rpcMock).toHaveBeenCalledWith("attendee_events_being_updated", { p_event_id: "event-9" });
    expect(detail).toMatchObject({ id: "event-9", title: "Updating Gala", status: "planning", organiserName: null });
    expect(detail.registration).toMatchObject({ required: true, capacity: null, withdrawalPermitted: true });
  });
});

// Attendees see the booked venues once the event is Confirmed.
describe("the event's booked venues", () => {
  it("lists them, main venue first, with their labels", async () => {
    mockRpc({
      attendee_visible_events: { data: [row], error: null },
      attendee_event_venues: {
        data: [
          { event_id: "event-1", venue_name: "Willow Room", venue_location: "Marina Bay", label: "Main programme", is_main_venue: true },
          { event_id: "event-1", venue_name: "Room 2.01", venue_location: "Block A", label: "Breakout A", is_main_venue: false },
        ],
        error: null,
      },
    });

    const detail = await loadAttendeeEventDetail("event-1");

    expect(rpcMock).toHaveBeenCalledWith("attendee_event_venues", { p_event_ids: ["event-1"] });
    expect(detail.venues).toEqual([
      { name: "Willow Room", location: "Marina Bay", label: "Main programme", isMainVenue: true },
      { name: "Room 2.01", location: "Block A", label: "Breakout A", isMainVenue: false },
    ]);
  });

  it("shows the event without venues if they can't be loaded", async () => {
    mockRpc({
      attendee_visible_events: { data: [row], error: null },
      attendee_event_venues: { data: null, error: { message: "boom" } },
    });

    await expect(loadAttendeeEventDetail("event-1")).resolves.toMatchObject({ venues: [] });
  });
});
