import { supabase } from "@/lib/supabase-client";

export type AssignedEventSummary = {
  id: string;
  title: string;
  purpose: string | null;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  updatedAt: string;
  submittedAt: string | null;
  organiserName: string | null;
};

export async function listAssignedEvents(coordinatorId: string) {
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
        organiser:profiles!events_organiser_id_fkey (full_name)
      `,
    )
    .eq("assigned_coordinator_id", coordinatorId)
    .order("updated_at", { ascending: false });

  if (error) throw new Error("We couldn't load your assigned events.");

  return data.map(
    (event): AssignedEventSummary => ({
      id: event.id,
      title: event.title,
      purpose: event.purpose,
      status: event.status,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      updatedAt: event.updated_at,
      submittedAt: event.submitted_at,
      organiserName: event.organiser?.full_name ?? null,
    }),
  );
}
