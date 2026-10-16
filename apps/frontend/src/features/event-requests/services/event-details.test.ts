import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { loadEventDetail } from "./event-details";

const row = {
  id: "event-1",
  title: "Career Fair",
  purpose: "Connect students with employers",
  description: "Booths and talks.",
  event_type: "Exhibition",
  expected_attendance: 300,
  starts_at: "2099-01-01T02:00:00.000Z",
  ends_at: "2099-01-01T08:00:00.000Z",
  status: "planning",
  submitted_at: "2098-12-01T02:00:00.000Z",
  organiser_id: "organiser-1",
  organiser: { full_name: "Jasmine" },
  assigned_coordinator_id: "coordinator-1",
  assigned_coordinator: { full_name: "Joyce" },
  event_venue_requirements: {
    preferred_location: "Grand Hall",
    minimum_capacity: 250,
    accessibility_notes: "Step-free access",
    layout_notes: "Exhibition",
  },
  event_required_facilities: [{ facility_name: "Projector" }, { facility_name: "Wi-Fi" }],
  event_equipment_requirements: [
    {
      id: "requirement-1",
      equipment_item_id: "item-1",
      equipment_name: "Wireless microphone",
      quantity: 2,
      required_from: "2099-01-01T02:00:00.000Z",
      required_until: "2099-01-01T08:00:00.000Z",
      notes: null,
      equipment_item: { category: "Audio" },
    },
  ],
  event_registration_requirements: {
    registration_required: true,
    registration_opens_at: "2098-12-10T02:00:00.000Z",
    registration_closes_at: "2098-12-20T02:00:00.000Z",
    attendee_capacity: 280,
    waitlist_enabled: true,
  },
};

beforeEach(() => {
  fromMock.mockReset();
});

describe("loadEventDetail", () => {
  // SPM-09 AC01: the detail page shows the event's current (latest) requirements.
  it("reads the event by id and maps its current requirements", async () => {
    const query = queryBuilder({ data: row, error: null });
    fromMock.mockReturnValue(query);

    await expect(loadEventDetail("event-1")).resolves.toEqual({
      id: "event-1",
      title: "Career Fair",
      purpose: "Connect students with employers",
      description: "Booths and talks.",
      eventType: "Exhibition",
      expectedAttendance: 300,
      startsAt: "2099-01-01T02:00:00.000Z",
      endsAt: "2099-01-01T08:00:00.000Z",
      status: "planning",
      submittedAt: "2098-12-01T02:00:00.000Z",
      organiserId: "organiser-1",
      organiserName: "Jasmine",
      assignedCoordinatorId: "coordinator-1",
      assignedCoordinatorName: "Joyce",
      venue: {
        preferredLocation: "Grand Hall",
        minimumCapacity: 250,
        accessibilityNotes: "Step-free access",
        layoutNotes: "Exhibition",
        facilities: ["Projector", "Wi-Fi"],
      },
      equipment: [
        {
          id: "requirement-1",
          equipmentItemId: "item-1",
          equipmentName: "Wireless microphone",
          category: "Audio",
          quantity: 2,
          requiredFrom: "2099-01-01T02:00:00.000Z",
          requiredUntil: "2099-01-01T08:00:00.000Z",
          technicalRequirements: null,
        },
      ],
      registration: {
        required: true,
        opensAt: "2098-12-10T02:00:00.000Z",
        closesAt: "2098-12-20T02:00:00.000Z",
        capacity: 280,
        waitlistEnabled: true,
      },
    });
    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("id", "event-1");
  });

  // SPM-09 AC01: requirements are shown whatever the lifecycle status — nothing filters on it.
  it.each(["requested", "confirmed", "completed", "rejected", "cancelled"])(
    "loads a %s event without filtering on its status",
    async (status) => {
      const query = queryBuilder({ data: { ...row, status }, error: null });
      fromMock.mockReturnValue(query);

      await expect(loadEventDetail("event-1")).resolves.toMatchObject({ status });
      expect(query.eq).toHaveBeenCalledTimes(1);
      expect(query.in).not.toHaveBeenCalled();
    },
  );

  // SPM-09 AC01: requirements the event never set still show, as "not set", not an error.
  it("falls back to empty requirements when the event has no venue or registration rows", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: {
          ...row,
          organiser: null,
          assigned_coordinator: null,
          event_venue_requirements: null,
          event_required_facilities: [],
          event_equipment_requirements: [],
          event_registration_requirements: null,
        },
        error: null,
      }),
    );

    const detail = await loadEventDetail("event-1");

    expect(detail.organiserName).toBeNull();
    expect(detail.assignedCoordinatorName).toBeNull();
    expect(detail.venue).toEqual({
      preferredLocation: null,
      minimumCapacity: null,
      accessibilityNotes: null,
      layoutNotes: null,
      facilities: [],
    });
    expect(detail.equipment).toEqual([]);
    expect(detail.registration).toEqual({
      required: false,
      opensAt: null,
      closesAt: null,
      capacity: null,
      waitlistEnabled: false,
    });
  });

  // SPM-09 AC02: an event the caller may not see comes back as no row.
  it("throws the access message when no event is visible", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(loadEventDetail("event-1")).rejects.toThrow(
      "This event is unavailable or you do not have access to it.",
    );
  });

  // SPM-09 AC02: a refused or failed read shows the same access message, not a raw error.
  it("throws the access message when the query fails", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "42501", message: "permission denied" } }),
    );

    await expect(loadEventDetail("event-1")).rejects.toThrow(
      "This event is unavailable or you do not have access to it.",
    );
  });
});
