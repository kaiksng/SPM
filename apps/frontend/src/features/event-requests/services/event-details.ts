import { supabase } from "@/lib/supabase-client";

export type EventDetail = {
  id: string;
  title: string;
  purpose: string | null;
  description: string | null;
  eventType: string | null;
  expectedAttendance: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  submittedAt: string | null;
  organiserId: string;
  organiserName: string | null;
  assignedCoordinatorName: string | null;
  venue: {
    preferredLocation: string | null;
    minimumCapacity: number | null;
    accessibilityNotes: string | null;
    layoutNotes: string | null;
    facilities: string[];
  };
  equipment: Array<{ equipmentName: string; quantity: number; notes: string | null }>;
  registration: {
    required: boolean;
    opensAt: string | null;
    closesAt: string | null;
    capacity: number | null;
    waitlistEnabled: boolean;
  };
};

/**
 * A full, read-only view of an event for whoever is allowed to see it
 * (RLS's can_view_event already covers the organiser, the assigned
 * coordinator, and staff roles) — unlike loadEventDraft, this isn't scoped to
 * the organiser or restricted to draft/requested, since it's for viewing, not
 * editing.
 */
export async function loadEventDetail(eventId: string) {
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
        submitted_at,
        organiser_id,
        organiser:profiles!events_organiser_id_fkey (full_name),
        assigned_coordinator:profiles!events_assigned_coordinator_id_fkey (full_name),
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
    .maybeSingle();

  if (error || !data) {
    throw new Error("This event is unavailable or you do not have access to it.");
  }

  const venue = data.event_venue_requirements;
  const registration = data.event_registration_requirements;

  return {
    id: data.id,
    title: data.title,
    purpose: data.purpose,
    description: data.description,
    eventType: data.event_type,
    expectedAttendance: data.expected_attendance,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    status: data.status,
    submittedAt: data.submitted_at,
    organiserId: data.organiser_id,
    organiserName: data.organiser?.full_name ?? null,
    assignedCoordinatorName: data.assigned_coordinator?.full_name ?? null,
    venue: {
      preferredLocation: venue?.preferred_location ?? null,
      minimumCapacity: venue?.minimum_capacity ?? null,
      accessibilityNotes: venue?.accessibility_notes ?? null,
      layoutNotes: venue?.layout_notes ?? null,
      facilities: data.event_required_facilities.map((f) => f.facility_name),
    },
    equipment: data.event_equipment_requirements.map((e) => ({
      equipmentName: e.equipment_name,
      quantity: e.quantity,
      notes: e.notes,
    })),
    registration: {
      required: registration?.registration_required ?? false,
      opensAt: registration?.registration_opens_at ?? null,
      closesAt: registration?.registration_closes_at ?? null,
      capacity: registration?.attendee_capacity ?? null,
      waitlistEnabled: registration?.waitlist_enabled ?? false,
    },
  } satisfies EventDetail;
}
