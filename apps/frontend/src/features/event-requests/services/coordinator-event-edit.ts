import {
  asRoomLayoutType,
  emptyEventRequestFormValues,
  toEventDraftPayload,
  type EventRequestFormValues,
  type EventStatus,
} from "@spm/shared";

import {
  toEquipmentFormValues,
  toEquipmentRequirements,
} from "@/features/event-requests/services/equipment";
import { localDateTime } from "@/features/event-requests/utils/local-date-time";
import { supabase } from "@/lib/supabase-client";

/** Shared with EventDetailPage's inline venue editor — same ISO -> datetime-local conversion. */
export { localDateTime };

/**
 * Loads an event's current requirements in the same
 * EventRequestFormValues shape loadEventDraft uses, so CoordinatorEventEditPage
 * can reuse EventRequestForm as-is. Read access is RLS's broader
 * can_view_event (any coordinator-role user, not just the assigned one) —
 * the narrower "must be the assigned coordinator" rule is enforced on write,
 * by update_event_as_coordinator itself.
 *
 * SPM-39 reuses this for applying an approved change request, which is also
 * allowed on Requested, Confirmed and Pending Safety Check events.
 */
export async function loadEventForCoordinatorEdit(
  eventId: string,
  statuses: readonly EventStatus[] = ["planning"],
) {
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
        event_equipment_requirements (
          id,
          equipment_item_id,
          equipment_name,
          quantity,
          required_from,
          required_until,
          notes,
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
    .in("status", statuses)
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      statuses.length === 1 && statuses[0] === "planning"
        ? "This event is unavailable, not in Planning, or you do not have access to it."
        : "This event is unavailable or you do not have access to it.",
    );
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
    // check_violation messages are written for the user and name the
    // affected field or equipment item (AC06).
    throw new Error(
      error?.code === "23514"
        ? error.message
        : "This event could not be updated. Your form values are still here.",
    );
  }

  return data;
}
