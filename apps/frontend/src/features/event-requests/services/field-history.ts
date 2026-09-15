import { supabase } from "@/lib/supabase-client";

export type EventFieldChange = {
  id: number;
  fieldName: string;
  previousValue: string | null;
  newValue: string | null;
  changedByName: string | null;
  changedAt: string;
};

/**
 * PB-07's change history for an event's requirements. RLS scopes this to the
 * event's assigned coordinator (or an administrator) — narrower than
 * loadEventDetail's "anyone who can view the event" — so an unassigned
 * coordinator or the organiser gets an empty list here rather than an error:
 * Postgres RLS filters rows silently instead of raising (AC03/AC04).
 */
export async function loadEventFieldHistory(eventId: string): Promise<EventFieldChange[]> {
  const { data, error } = await supabase
    .from("event_field_changes")
    .select(
      `
        id,
        field_name,
        previous_value,
        new_value,
        changed_at,
        changed_by:profiles!event_field_changes_changed_by_fkey (full_name)
      `,
    )
    .eq("event_id", eventId)
    // `now()` is constant for an entire transaction in Postgres, so a single
    // save_event_draft call can log several rows with an identical
    // changed_at — `id` (a strictly increasing identity column) is the
    // tiebreaker that keeps "in sequence" (AC02) true even then.
    .order("changed_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error("The change history for this event is unavailable.");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    fieldName: row.field_name,
    previousValue: row.previous_value,
    newValue: row.new_value,
    changedByName: row.changed_by?.full_name ?? null,
    changedAt: row.changed_at,
  }));
}
