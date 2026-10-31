import {
  asRoomLayoutType,
  emptyEventRequestFormValues,
  eventDraftSchema,
  toEventDraftPayload,
  type EventRequestFormValues,
  type RegistrationSettingsSnapshot,
} from "@spm/shared";

import {
  toEquipmentFormValues,
  toEquipmentRequirements,
} from "@/features/event-requests/services/equipment";
import { localDateTime } from "@/features/event-requests/utils/local-date-time";
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
  // PB-04 AC02: the organiser can see who is coordinating their request.
  assignedCoordinatorName: string | null;
  // So the card can flag registration the organiser still has to set up.
  registration: RegistrationSettingsSnapshot;
};


function operationError(message: string) {
  return new Error(message);
}

export async function listEventRequests(organiserId: string) {
  const { data, error } = await supabase
    .from("events")
    .select(
      `
        id,
        title,
        purpose,
        status,
        starts_at,
        ends_at,
        updated_at,
        submitted_at,
        assigned_coordinator_id,
        assigned_coordinator:profiles!events_assigned_coordinator_id_fkey (full_name),
        event_registration_requirements (
          registration_required,
          registration_opens_at,
          registration_closes_at,
          attendee_capacity
        )
      `,
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
      assignedCoordinatorName: event.assigned_coordinator?.full_name ?? null,
      registration: {
        required: event.event_registration_requirements?.registration_required ?? false,
        opensAt: event.event_registration_requirements?.registration_opens_at ?? null,
        closesAt: event.event_registration_requirements?.registration_closes_at ?? null,
        capacity: event.event_registration_requirements?.attendee_capacity ?? null,
      },
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
        banner_path,
        requirements_acknowledged,
        event_venue_requirements (
          preferred_location,
          minimum_capacity,
          accessibility_notes,
          layout_notes
        ),
        event_required_facilities (facility_name),
        event_equipment_requirements (
          id,
          equipment_item_id,
          equipment_name,
          quantity,
          required_from,
          required_until,
          notes,
          requested_at,
          equipment_item:equipment_items (category)
        ),
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

  const values = {
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
      layoutNotes: asRoomLayoutType(venue?.layout_notes),
      facilities: data.event_required_facilities.map(
        (facility) => facility.facility_name,
      ),
    },
    equipment: toEquipmentFormValues(
      toEquipmentRequirements(data.event_equipment_requirements),
    ),
    registration: {
      required: registration?.registration_required ?? false,
      opensAt: localDateTime(registration?.registration_opens_at ?? null),
      closesAt: localDateTime(registration?.registration_closes_at ?? null),
      capacity: registration?.attendee_capacity?.toString() ?? "",
      waitlistEnabled: registration?.waitlist_enabled ?? false,
    },
    requirementsAcknowledged: data.requirements_acknowledged,
  } satisfies EventRequestFormValues;

  return { values, status: data.status, bannerPath: data.banner_path };
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
    // check_violation messages are written for the user and name the
    // affected field or equipment item (AC06).
    throw operationError(
      error?.code === "23514"
        ? error.message
        : "Your draft could not be saved. Your form values are still here.",
    );
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

/**
 * Unlike deleteEventDraft, this doesn't remove the row — a Requested event
 * has already been assigned to a coordinator, so cancel_event_request marks
 * it Cancelled instead, preserving that history. Surfaces the database's own
 * exception text (e.g. an unresolved clarification) rather than a generic
 * fallback, same reasoning as submitVenueBookingRequest.
 */
export async function cancelEventRequest(eventId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_event_request", {
    p_event_id: eventId,
  });

  if (error) {
    throw operationError(error.message || "This event request could not be cancelled.");
  }
}
