import {
  emptyEventRequestFormValues,
  eventDraftSchema,
  toEventDraftPayload,
  type EventRequestFormValues,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type EventDraftSummary = {
  id: string;
  title: string;
  purpose: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
  submittedAt: string | null;
  assignedCoordinatorId: string | null;
};

function localDateTime(isoValue: string | null) {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function operationError(message: string) {
  return new Error(message);
}

export async function listEventRequests(organiserId: string) {
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, purpose, status, starts_at, ends_at, updated_at, submitted_at, assigned_coordinator_id",
    )
    .eq("organiser_id", organiserId)
    .order("updated_at", { ascending: false });

  if (error) throw operationError("We couldn't load your event requests.");

  return data.map(
    (event): EventDraftSummary => ({
      id: event.id,
      title: event.title,
      purpose: event.purpose,
      status: event.status,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      updatedAt: event.updated_at,
      submittedAt: event.submitted_at,
      assignedCoordinatorId: event.assigned_coordinator_id,
    }),
  );
}

export async function loadEventDraft(eventId: string) {
  const { data, error } = await supabase
    .from("events")
    .select(
      `
        id,
        title,
        purpose,
        description,
        event_type,
        expected_attendance,
        starts_at,
        ends_at,
        status,
        requirements_acknowledged,
        event_venue_requirements (
          preferred_location,
          minimum_capacity,
          accessibility_notes,
          layout_notes
        ),
        event_required_facilities (facility_name),
        event_equipment_requirements (equipment_name, quantity, notes),
        event_registration_requirements (
          registration_required,
          registration_opens_at,
          registration_closes_at,
          attendee_capacity,
          waitlist_enabled
        )
      `,
    )
    .eq("id", eventId)
    // A requested event may still be reopened for a permitted pre-approval
    // edit (PB-03 AC07); public.save_event_draft enforces the same statuses.
    .in("status", ["draft", "requested"])
    .maybeSingle();

  if (error || !data) {
    throw operationError("This request is unavailable or you do not have access to it.");
  }

  const venue = data.event_venue_requirements;
  const registration = data.event_registration_requirements;

  return {
    ...structuredClone(emptyEventRequestFormValues),
    title: data.title,
    purpose: data.purpose ?? "",
    description: data.description ?? "",
    eventType: data.event_type ?? "",
    expectedAttendance: data.expected_attendance?.toString() ?? "",
    startsAt: localDateTime(data.starts_at),
    endsAt: localDateTime(data.ends_at),
    venue: {
      preferredLocation: venue?.preferred_location ?? "",
      minimumCapacity: venue?.minimum_capacity?.toString() ?? "",
      accessibilityNotes: venue?.accessibility_notes ?? "",
      layoutNotes: venue?.layout_notes ?? "",
      facilities: data.event_required_facilities.map(
        (facility) => facility.facility_name,
      ),
    },
    equipment: data.event_equipment_requirements.map((item) => ({
      equipmentName: item.equipment_name,
      quantity: item.quantity.toString(),
      notes: item.notes ?? "",
    })),
    registration: {
      required: registration?.registration_required ?? false,
      opensAt: localDateTime(registration?.registration_opens_at ?? null),
      closesAt: localDateTime(registration?.registration_closes_at ?? null),
      capacity: registration?.attendee_capacity?.toString() ?? "",
      waitlistEnabled: registration?.waitlist_enabled ?? false,
    },
    requirementsAcknowledged: data.requirements_acknowledged,
  } satisfies EventRequestFormValues;
}

export async function saveEventDraft(
  values: EventRequestFormValues,
  eventId?: string,
) {
  const parsed = eventDraftSchema.parse(values);
  const { data, error } = await supabase.rpc("save_event_draft", {
    draft: toEventDraftPayload(parsed),
    target_event_id: eventId ?? undefined,
  });

  if (error || !data) {
    throw operationError("Your draft could not be saved. Your form values are still here.");
  }

  return data;
}

export async function deleteEventDraft(eventId: string) {
  const { data, error } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("status", "draft")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    throw operationError("This draft could not be deleted.");
  }
}
