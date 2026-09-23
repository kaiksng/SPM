import {
  asRoomLayoutType,
  emptyEventRequestFormValues,
  toEventDraftPayload,
  type EventRequestFormValues,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

function localDateTime(isoValue: string | null) {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

/**
 * Loads a Planning event's current requirements in the same
 * EventRequestFormValues shape loadEventDraft uses, so CoordinatorEventEditPage
 * can reuse EventRequestForm as-is. Read access is RLS's broader
 * can_view_event (any coordinator-role user, not just the assigned one) —
 * the narrower "must be the assigned coordinator" rule is enforced on write,
 * by update_event_as_coordinator itself.
 */
export async function loadEventForCoordinatorEdit(eventId: string) {
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
    .eq("status", "planning")
    .maybeSingle();

  if (error || !data) {
    throw new Error("This event is unavailable, not in Planning, or you do not have access to it.");
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
      layoutNotes: asRoomLayoutType(venue?.layout_notes),
      facilities: data.event_required_facilities.map((facility) => facility.facility_name),
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
    // Not part of a Planning update — the acknowledgement only guards
    // submission (PB-03), which this event has already passed.
    requirementsAcknowledged: true,
  } satisfies EventRequestFormValues;
}

/**
 * Same payload shape save_event_draft/submit_event_request already use
 * (toEventDraftPayload), sent to the coordinator-only RPC instead — see
 * 202609150006_coordinator_update_planning_event.sql. The existing PB-07
 * triggers log the resulting field-level changes regardless of which write
 * path reached them.
 */
export async function updateEventAsCoordinator(
  eventId: string,
  values: EventRequestFormValues,
) {
  const { data, error } = await supabase.rpc("update_event_as_coordinator", {
    p_event_id: eventId,
    updates: toEventDraftPayload(values),
  });

  if (error || !data) {
    throw new Error("This event could not be updated. Your form values are still here.");
  }

  return data;
}
