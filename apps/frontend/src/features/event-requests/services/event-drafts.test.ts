import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock } = vi.hoisted(() => ({ fromMock: vi.fn(), rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));

import { emptyEventRequestFormValues } from "@spm/shared";

import {
  cancelEventRequest,
  deleteEventDraft,
  listEventRequests,
  loadEventDraft,
  saveEventDraft,
} from "./event-drafts";

const organiserId = "10000000-0000-0000-0000-000000000001";

const row = {
  id: "event-1",
  title: "Career Fair",
  purpose: "Connect students with employers",
  status: "planning",
  starts_at: "2099-01-01T02:00:00.000Z",
  ends_at: "2099-01-01T08:00:00.000Z",
  updated_at: "2098-12-02T02:00:00.000Z",
  submitted_at: "2098-12-01T02:00:00.000Z",
  assigned_coordinator_id: "coordinator-1",
  assigned_coordinator: { full_name: "Joyce" },
  event_registration_requirements: {
    registration_required: true,
    registration_opens_at: null,
    registration_closes_at: null,
    attendee_capacity: 80,
  },
};

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
});

describe("listEventRequests", () => {
  // SPM-14 AC01: the organiser's list is scoped to the events they own.
  it("reads only the signed-in organiser's events, newest first", async () => {
    const query = queryBuilder({ data: [row], error: null });
    fromMock.mockReturnValue(query);

    await listEventRequests(organiserId);

    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("organiser_id", organiserId);
    expect(query.order).toHaveBeenCalledWith("updated_at", { ascending: false });
  });

  // SPM-14 AC01: each authorised event is returned for the organiser to view.
  it("maps every authorised event into a summary", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          row,
          {
            ...row,
            id: "event-2",
            title: "Orientation",
            status: "draft",
            submitted_at: null,
            assigned_coordinator_id: null,
            assigned_coordinator: null,
            // No registration row yet: treated as not required.
            event_registration_requirements: null,
          },
        ],
        error: null,
      }),
    );

    await expect(listEventRequests(organiserId)).resolves.toEqual([
      {
        id: "event-1",
        title: "Career Fair",
        purpose: "Connect students with employers",
        status: "planning",
        startsAt: "2099-01-01T02:00:00.000Z",
        endsAt: "2099-01-01T08:00:00.000Z",
        updatedAt: "2098-12-02T02:00:00.000Z",
        submittedAt: "2098-12-01T02:00:00.000Z",
        assignedCoordinatorId: "coordinator-1",
        assignedCoordinatorName: "Joyce",
        registration: {
          required: true,
          opensAt: null,
          closesAt: null,
          capacity: 80,
        },
      },
      {
        id: "event-2",
        title: "Orientation",
        purpose: "Connect students with employers",
        status: "draft",
        startsAt: "2099-01-01T02:00:00.000Z",
        endsAt: "2099-01-01T08:00:00.000Z",
        updatedAt: "2098-12-02T02:00:00.000Z",
        submittedAt: null,
        assignedCoordinatorId: null,
        assignedCoordinatorName: null,
        registration: { required: false, opensAt: null, closesAt: null, capacity: null },
      },
    ]);
  });

  // SPM-14 AC03: a refused read surfaces a plain message, not the raw error.
  it("throws a friendly message when the read fails", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "42501", message: "permission denied" } }),
    );

    await expect(listEventRequests(organiserId)).rejects.toThrow(
      "We couldn't load your event requests.",
    );
  });
});

const draftRow = {
  id: "event-1",
  title: "Career Fair",
  purpose: "Connect students with employers",
  description: "Annual fair",
  event_type: "Conference",
  expected_attendance: 120,
  starts_at: "2099-01-01T02:00:00.000Z",
  ends_at: "2099-01-01T08:00:00.000Z",
  status: "draft",
  requirements_acknowledged: true,
  event_venue_requirements: {
    preferred_location: "Bugis",
    minimum_capacity: 100,
    accessibility_notes: "Step-free",
    layout_notes: " Theatre ",
  },
  event_required_facilities: [{ facility_name: "Projector" }, { facility_name: "Microphone" }],
  event_equipment_requirements: [
    {
      id: "req-1",
      equipment_item_id: "item-1",
      equipment_name: "Projector",
      quantity: 2,
      required_from: "2099-01-01T01:00:00.000Z",
      required_until: "2099-01-01T09:00:00.000Z",
      notes: "Rear of hall",
      equipment_item: { category: "AV" },
    },
  ],
  event_registration_requirements: {
    registration_required: true,
    registration_opens_at: "2098-12-01T02:00:00.000Z",
    registration_closes_at: "2098-12-30T02:00:00.000Z",
    attendee_capacity: 80,
    waitlist_enabled: true,
  },
};

describe("loadEventDraft", () => {
  // SPM-2 AC: the owning organiser can reopen a Draft and all the latest saved values are displayed.
  it("returns every saved value in the form's shape, with its status", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: draftRow, error: null }));

    const { values, status } = await loadEventDraft("event-1");

    expect(status).toBe("draft");
    expect(values).toMatchObject({
      title: "Career Fair",
      purpose: "Connect students with employers",
      description: "Annual fair",
      eventType: "Conference",
      expectedAttendance: "120",
      venue: {
        preferredLocation: "Bugis",
        minimumCapacity: "100",
        accessibilityNotes: "Step-free",
        layoutNotes: "Theatre",
        facilities: ["Projector", "Microphone"],
      },
      registration: { required: true, capacity: "80", waitlistEnabled: true },
      requirementsAcknowledged: true,
    });
    expect(values.startsAt).toMatch(/^2099-01-01T\d{2}:\d{2}$/);
    expect(values.registration.opensAt).toMatch(/^2098-12-01T\d{2}:\d{2}$/);
    expect(values.equipment).toEqual([
      expect.objectContaining({ id: "req-1", equipmentItemId: "item-1", quantity: "2", notes: "Rear of hall" }),
    ]);
  });

  // SPM-2 AC: only the event name is mandatory for a Draft, so every other field may be empty.
  it("fills fields that were never saved with blank values", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: {
          id: "event-2",
          title: "Just a name",
          purpose: null,
          description: null,
          event_type: null,
          expected_attendance: null,
          starts_at: null,
          ends_at: null,
          status: "draft",
          requirements_acknowledged: false,
          event_venue_requirements: null,
          event_required_facilities: [],
          event_equipment_requirements: [],
          event_registration_requirements: null,
        },
        error: null,
      }),
    );

    const { values } = await loadEventDraft("event-2");

    expect(values).toEqual({ ...emptyEventRequestFormValues, title: "Just a name" });
  });

  it("reads one event by id and only while it is a Draft or a Requested event", async () => {
    const query = queryBuilder({ data: draftRow, error: null });
    fromMock.mockReturnValue(query);

    await loadEventDraft("event-1");

    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.eq).toHaveBeenCalledWith("id", "event-1");
    expect(query.in).toHaveBeenCalledWith("status", ["draft", "requested"]);
  });

  // SPM-2 AC: a user who does not own the Draft cannot view it, and nothing protected is displayed.
  it("says the request is unavailable when it is not found or not readable", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: null }));
    await expect(loadEventDraft("event-9")).rejects.toThrow(
      "This request is unavailable or you do not have access to it.",
    );

    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: { code: "42501", message: "denied" } }));
    await expect(loadEventDraft("event-9")).rejects.toThrow(
      "This request is unavailable or you do not have access to it.",
    );
  });
});

describe("saveEventDraft", () => {
  // SPM-2 AC: a Draft can be saved with only the event name completed.
  it("saves a new Draft from the event name alone", async () => {
    rpcMock.mockResolvedValue({ data: "event-new", error: null });

    await expect(saveEventDraft({ ...emptyEventRequestFormValues, title: "  Open Day  " })).resolves.toBe("event-new");

    expect(rpcMock).toHaveBeenCalledWith("save_event_draft", {
      draft: expect.objectContaining({ title: "Open Day", purpose: null, startsAt: null, endsAt: null }),
      target_event_id: undefined,
    });
  });

  // SPM-2 AC: the owner can edit a Draft repeatedly; the same Draft is updated, not duplicated.
  it("updates the existing Draft when an event id is given", async () => {
    rpcMock.mockResolvedValue({ data: "event-1", error: null });

    await saveEventDraft({ ...emptyEventRequestFormValues, title: "Open Day" }, "event-1");

    expect(rpcMock).toHaveBeenCalledWith("save_event_draft", expect.objectContaining({ target_event_id: "event-1" }));
  });

  // SPM-2 AC: the event name is the one required field, so a Draft without it is not sent.
  it("rejects a Draft with no event name before calling the database", async () => {
    await expect(saveEventDraft({ ...emptyEventRequestFormValues, title: "   " })).rejects.toThrow();

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("shows the database's own message when a value is not allowed", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "23514", message: "Expected attendance must be a whole number" } });

    await expect(saveEventDraft({ ...emptyEventRequestFormValues, title: "Open Day" })).rejects.toThrow(
      "Expected attendance must be a whole number",
    );
  });

  it("keeps the organiser's values and says so when saving fails for any other reason", async () => {
    const failure = "Your draft could not be saved. Your form values are still here.";
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "internal detail" } });
    await expect(saveEventDraft({ ...emptyEventRequestFormValues, title: "Open Day" })).rejects.toThrow(failure);

    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(saveEventDraft({ ...emptyEventRequestFormValues, title: "Open Day" })).rejects.toThrow(failure);
  });
});

describe("deleteEventDraft", () => {
  function deleteQuery(result: { data: unknown; error: unknown }) {
    const query = queryBuilder(result);
    Object.assign(query, { delete: vi.fn().mockReturnValue(query) });
    return query as typeof query & { delete: ReturnType<typeof vi.fn> };
  }

  // SPM-2 AC: only a Draft can be deleted.
  it("deletes the event by id, and only while it is still a Draft", async () => {
    const query = deleteQuery({ data: { id: "event-1" }, error: null });
    fromMock.mockReturnValue(query);

    await expect(deleteEventDraft("event-1")).resolves.toBeUndefined();

    expect(fromMock).toHaveBeenCalledWith("events");
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith("id", "event-1");
    expect(query.eq).toHaveBeenCalledWith("status", "draft");
  });

  // SPM-2 AC: a Draft that is not the user's, or no longer a Draft, is not removed.
  it("says the draft could not be deleted when nothing was removed or the delete is refused", async () => {
    fromMock.mockReturnValueOnce(deleteQuery({ data: null, error: null }));
    await expect(deleteEventDraft("event-1")).rejects.toThrow("This draft could not be deleted.");

    fromMock.mockReturnValueOnce(deleteQuery({ data: null, error: { code: "42501", message: "denied" } }));
    await expect(deleteEventDraft("event-1")).rejects.toThrow("This draft could not be deleted.");
  });
});

describe("cancelEventRequest", () => {
  it("cancels the request through the database function", async () => {
    rpcMock.mockResolvedValue({ error: null });

    await expect(cancelEventRequest("event-1")).resolves.toBeUndefined();

    expect(rpcMock).toHaveBeenCalledWith("cancel_event_request", { p_event_id: "event-1" });
  });

  it("shows the database's own reason when it refuses", async () => {
    rpcMock.mockResolvedValue({ error: { message: "A clarification is still open" } });

    await expect(cancelEventRequest("event-1")).rejects.toThrow("A clarification is still open");
  });

  it("falls back to a plain message when the refusal carries no text", async () => {
    rpcMock.mockResolvedValue({ error: { message: "" } });

    await expect(cancelEventRequest("event-1")).rejects.toThrow("This event request could not be cancelled.");
  });
});
