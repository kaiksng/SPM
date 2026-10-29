import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

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
