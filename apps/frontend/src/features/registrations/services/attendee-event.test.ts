import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { loadAttendeeEventDetail } from "./attendee-event";

const row = {
  id: "event-1",
  title: "AI Innovation Summit",
  description: "A full day of talks.",
  starts_at: "2099-11-12T02:00:00Z",
  ends_at: "2099-11-12T08:00:00Z",
  status: "confirmed",
  organiser: { full_name: "Student Life Office" },
  event_venue_requirements: { preferred_location: "Auditorium" },
  event_registration_requirements: {
    registration_required: true,
    registration_opens_at: null,
    registration_closes_at: "2099-11-10T00:00:00Z",
    attendee_capacity: 50,
    waitlist_enabled: true,
    withdrawal_permitted: false,
  },
};

beforeEach(() => {
  rpcMock.mockReset().mockResolvedValue({ data: [], error: null });
  fromMock.mockReset();
});

describe("loadAttendeeEventDetail", () => {
  it("maps the event's public details and registration settings", async () => {
    const query = queryBuilder({ data: row, error: null });
    fromMock.mockReturnValue(query);

    await expect(loadAttendeeEventDetail("event-1")).resolves.toEqual({
      id: "event-1",
      title: "AI Innovation Summit",
      description: "A full day of talks.",
      startsAt: "2099-11-12T02:00:00Z",
      endsAt: "2099-11-12T08:00:00Z",
      status: "confirmed",
      organiserName: "Student Life Office",
      venue: { preferredLocation: "Auditorium" },
      registration: {
        required: true,
        opensAt: null,
        closesAt: "2099-11-10T00:00:00Z",
        capacity: 50,
        waitlistEnabled: true,
        withdrawalPermitted: false,
      },
    });
    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("id", "event-1");
  });

  // SPM-44 AC05: internal venue and equipment details are never even requested.
  it("never asks for equipment, facilities, venue notes or other internal planning fields", async () => {
    const query = queryBuilder({ data: row, error: null });
    fromMock.mockReturnValue(query);

    await loadAttendeeEventDetail("event-1");

    const selected = String(query.select.mock.calls[0]?.[0]);
    for (const internal of [
      "event_equipment_requirements",
      "event_required_facilities",
      "accessibility_notes",
      "layout_notes",
      "minimum_capacity",
      "purpose",
      "expected_attendance",
      "assigned_coordinator",
    ]) {
      expect(selected).not.toContain(internal);
    }
  });

  it("falls back to defaults when the event has no venue or registration rows", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: { ...row, organiser: null, event_venue_requirements: null, event_registration_requirements: null },
        error: null,
      }),
    );

    await expect(loadAttendeeEventDetail("event-1")).resolves.toMatchObject({
      organiserName: null,
      venue: { preferredLocation: null },
      registration: { required: false, capacity: null, waitlistEnabled: false, withdrawalPermitted: false },
    });
  });

  it.each([
    ["no event is visible", { data: null, error: null }],
    ["the read fails", { data: null, error: { message: "boom" } }],
  ])("throws the access message when %s", async (_label, result) => {
    fromMock.mockReturnValue(queryBuilder(result));

    await expect(loadAttendeeEventDetail("event-1")).rejects.toThrow(
      "This event is unavailable or you do not have access to it.",
    );
  });
});

// An event attendees can't read directly may be a Confirmed event back under
// review: its attendee-safe details still load.
describe("an event being updated", () => {
  it("loads its attendee-safe details when the event itself isn't readable", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));
    rpcMock.mockResolvedValue({
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
    });

    const detail = await loadAttendeeEventDetail("event-9");

    expect(rpcMock).toHaveBeenCalledWith("attendee_events_being_updated", { p_event_id: "event-9" });
    expect(detail).toMatchObject({ id: "event-9", title: "Updating Gala", status: "planning", organiserName: null });
    expect(detail.registration).toMatchObject({ required: true, capacity: null, withdrawalPermitted: true });
  });
});
