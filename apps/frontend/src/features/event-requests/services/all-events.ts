import { supabase } from "@/lib/supabase-client";

export type LeadEventSummary = {
  id: string;
  title: string;
  purpose: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
  submittedAt: string | null;
  expectedAttendance: number | null;
  organiserName: string | null;
  assignedCoordinatorId: string | null;
  assignedCoordinatorName: string | null;
};

/**
 * Every event visible to the Event Coordinator Lead — RLS (can_view_event)
 * already scopes this to "every event" for the role, so there's no filter
 * to apply here, unlike the organiser's and coordinator's own-events lists.
 */
export async function listAllEvents() {
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
        expected_attendance,
        assigned_coordinator_id,
        organiser:profiles!events_organiser_id_fkey (full_name),
        coordinator:profiles!events_assigned_coordinator_id_fkey (full_name)
      `,
    )
    .order("updated_at", { ascending: false });

  if (error) throw new Error("We couldn't load events.");

  return data.map(
    (event): LeadEventSummary => ({
      id: event.id,
      title: event.title,
      purpose: event.purpose,
      status: event.status,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      updatedAt: event.updated_at,
      submittedAt: event.submitted_at,
      expectedAttendance: event.expected_attendance,
      organiserName: event.organiser?.full_name ?? null,
      assignedCoordinatorId: event.assigned_coordinator_id,
      assignedCoordinatorName: event.coordinator?.full_name ?? null,
    }),
  );
}

export type CoordinatorOption = {
  id: string;
  fullName: string | null;
};

/** The roster of Event Coordinators the Lead can assign an event to. */
export async function listCoordinators() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "event_coordinator")
    .order("full_name", { ascending: true });

  if (error) throw new Error("We couldn't load the list of coordinators.");

  return data.map(
    (row): CoordinatorOption => ({ id: row.id, fullName: row.full_name }),
  );
}

/**
 * Assigns (from unassigned) or reassigns (from one coordinator to another)
 * an event's Event Coordinator. A reason is only required when there's a
 * previous coordinator to justify taking the event from — the database
 * enforces this, not this function.
 */
export async function assignEventCoordinator(
  eventId: string,
  coordinatorId: string,
  reason: string,
) {
  const { error } = await supabase.rpc("reassign_event_coordinator", {
    p_event_id: eventId,
    p_new_coordinator_id: coordinatorId,
    p_reason: reason,
  });

  if (error) throw new Error(error.message);
}
