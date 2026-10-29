import { emptyEventRequestFormValues, type EventRequestFormValues } from "@spm/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import {
  loadEventForCoordinatorEdit,
  saveEventEquipment,
  updateEventAsCoordinator,
} from "./coordinator-event-edit";

const formValues: EventRequestFormValues = {
  ...emptyEventRequestFormValues,
  title: " Career Fair ",
  purpose: "Connect students with employers",
  description: "",
  eventType: "Exhibition",
  expectedAttendance: "300",
  startsAt: "2099-01-01T10:00",
  endsAt: "2099-01-01T16:00",
  venue: {
    preferredLocation: "North",
    minimumCapacity: "",
    accessibilityNotes: "Step-free entrance",
    layoutNotes: "Classroom",
    facilities: ["Parking"],
  },
  equipment: [
    {
      id: "requirement-1",
      equipmentItemId: "item-1",
      legacyName: "",
      quantity: "03",
      requiredFrom: "2099-01-01T10:00",
      requiredUntil: "2099-01-01T16:00",
      notes: "",
    },
  ],
  registration: {
    required: true,
    opensAt: "2098-12-01T09:00",
    closesAt: "2098-12-20T17:00",
    capacity: "250",
    waitlistEnabled: false,
  },
  requirementsAcknowledged: true,
};

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("loadEventForCoordinatorEdit", () => {
  // SPM-10 AC01-AC03: the edit form only ever opens an event that is in Planning.
  it("only loads the event while it is in Planning", async () => {
    const query = queryBuilder({ data: null, error: null });
    fromMock.mockReturnValue(query);

    await expect(loadEventForCoordinatorEdit("event-1")).rejects.toThrow(
      "This event is unavailable, not in Planning, or you do not have access to it.",
    );
    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("id", "event-1");
    expect(query.in).toHaveBeenCalledWith("status", ["planning"]);
  });

  // SPM-39 AC07: applying an approved change also opens Confirmed and
  // Pending Safety Check events.
  it("loads the event in any of the statuses it is given", async () => {
    const query = queryBuilder({ data: null, error: null });
    fromMock.mockReturnValue(query);

    await expect(
      loadEventForCoordinatorEdit("event-1", ["planning", "confirmed"]),
    ).rejects.toThrow("This event is unavailable or you do not have access to it.");
    expect(query.in).toHaveBeenCalledWith("status", ["planning", "confirmed"]);
  });

  // SPM-10 AC01: locked fields are loaded with their saved values so they can be
  // sent back unchanged.
  it("pre-fills the form with the event's saved requirements", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: {
          id: "event-1",
          title: "Career Fair",
          purpose: "Connect students with employers",
          description: null,
          event_type: "Exhibition",
          expected_attendance: 300,
          starts_at: "2099-01-01T02:00:00.000Z",
          ends_at: "2099-01-01T08:00:00.000Z",
          status: "planning",
          event_venue_requirements: {
            preferred_location: "North",
            minimum_capacity: null,
            accessibility_notes: "Step-free entrance",
            layout_notes: "Classroom",
          },
          event_required_facilities: [{ facility_name: "Parking" }],
          event_equipment_requirements: [],
          event_registration_requirements: {
            registration_required: true,
            registration_opens_at: "2098-12-01T01:00:00.000Z",
            registration_closes_at: "2098-12-20T09:00:00.000Z",
            attendee_capacity: 250,
            waitlist_enabled: false,
          },
        },
        error: null,
      }),
    );

    await expect(loadEventForCoordinatorEdit("event-1")).resolves.toMatchObject({
      title: "Career Fair",
      purpose: "Connect students with employers",
      description: "",
      eventType: "Exhibition",
      expectedAttendance: "300",
      startsAt: "2099-01-01T10:00",
      endsAt: "2099-01-01T16:00",
      venue: {
        preferredLocation: "North",
        minimumCapacity: "",
        accessibilityNotes: "Step-free entrance",
        layoutNotes: "Classroom",
        facilities: ["Parking"],
      },
      equipment: [],
      registration: {
        required: true,
        opensAt: "2098-12-01T09:00",
        closesAt: "2098-12-20T17:00",
        capacity: "250",
        waitlistEnabled: false,
      },
    });
  });
});

describe("updateEventAsCoordinator", () => {
  // SPM-10 AC01 + AC03: one request carries the venue and equipment changes
  // together with the locked fields, for the database to check.
  it("sends the whole event to update_event_as_coordinator", async () => {
    rpcMock.mockResolvedValue({ data: "event-1", error: null });

    await expect(updateEventAsCoordinator("event-1", formValues)).resolves.toBe("event-1");
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, args] = rpcMock.mock.calls[0]!;
    expect(name).toBe("update_event_as_coordinator");
    expect(args.p_event_id).toBe("event-1");
    expect(args.updates).toMatchObject({
      title: "Career Fair",
      purpose: "Connect students with employers",
      description: null,
      eventType: "Exhibition",
      expectedAttendance: "300",
      venue: {
        preferredLocation: "North",
        accessibilityNotes: "Step-free entrance",
        layoutNotes: "Classroom",
        facilities: ["Parking"],
      },
      equipment: [{ id: "requirement-1", equipmentItemId: "item-1", quantity: "3" }],
      registration: { required: true, capacity: "250", waitlistEnabled: false },
    });
    expect(args.updates.startsAt).toBe(new Date("2099-01-01T02:00:00.000Z").toISOString());
  });

  // SPM-10 AC02: a locked-field change is rejected by the database (23514) and
  // its message names the locked field.
  it("passes on the database's reason when a locked field is rejected", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "Registration details are locked once the event reaches Planning" },
    });

    await expect(updateEventAsCoordinator("event-1", formValues)).rejects.toThrow(
      "Registration details are locked once the event reaches Planning",
    );
  });

  // SPM-10 AC02 (error case): any other failure is reported as not saved.
  it("reports a generic failure without claiming anything was saved", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "Only the assigned coordinator can update this event" },
    });

    await expect(updateEventAsCoordinator("event-1", formValues)).rejects.toThrow(
      "This event could not be updated. Your form values are still here.",
    );
  });
});

describe("saveEventEquipment", () => {
  // The Equipment page's Request equipment / Edit / Remove: only the equipment
  // changes; everything else is resent exactly as it was loaded.
  it("reloads the Planning event and resends it with only its equipment changed", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: {
          id: "event-1",
          title: "Career Fair",
          purpose: "Connect students with employers",
          description: null,
          event_type: "Exhibition",
          expected_attendance: 300,
          starts_at: "2099-01-01T02:00:00.000Z",
          ends_at: "2099-01-01T08:00:00.000Z",
          status: "planning",
          event_venue_requirements: null,
          event_required_facilities: [],
          event_equipment_requirements: [],
          event_registration_requirements: null,
        },
        error: null,
      }),
    );
    rpcMock.mockResolvedValue({ data: "event-1", error: null });
    const added = {
      id: "",
      equipmentItemId: "item-1",
      legacyName: "",
      quantity: "2",
      requiredFrom: "2099-01-01T10:00",
      requiredUntil: "2099-01-01T16:00",
      notes: "",
    };

    await saveEventEquipment("event-1", (equipment) => [...equipment, added]);

    const query = fromMock.mock.results[0]!.value;
    expect(query.in).toHaveBeenCalledWith("status", ["planning"]);
    const [name, args] = rpcMock.mock.calls[0]!;
    expect(name).toBe("update_event_as_coordinator");
    expect(args.updates).toMatchObject({
      title: "Career Fair",
      expectedAttendance: "300",
      equipment: [{ equipmentItemId: "item-1", quantity: "2" }],
    });
    expect(args.updates.startsAt).toBe("2099-01-01T02:00:00.000Z");
  });
});
