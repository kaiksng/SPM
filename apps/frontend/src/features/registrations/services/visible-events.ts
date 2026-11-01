import { supabase } from "@/lib/supabase-client";

/**
 * One event as an attendee may see it: published fields only. An attendee has
 * no read access to the events table (SPM-49), so every attendee screen reads
 * events through the attendee_visible_events RPC (202611010014) instead.
 */
export type VisibleEvent = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  bannerPath: string | null;
  organiserName: string | null;
  preferredLocation: string | null;
  registrationRequired: boolean | null;
  registrationOpensAt: string | null;
  registrationClosesAt: string | null;
  attendeeCapacity: number | null;
  waitlistEnabled: boolean | null;
  withdrawalPermitted: boolean | null;
};

/** The events the signed-in user may see as an attendee, optionally limited to some ids. */
export async function loadVisibleEvents(eventIds?: string[]): Promise<VisibleEvent[]> {
  const { data, error } = await supabase.rpc("attendee_visible_events", {
    p_event_ids: eventIds,
  });

  if (error) throw new Error("We couldn't load events.");

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    status: row.status,
    bannerPath: row.banner_path ?? null,
    organiserName: row.organiser_name ?? null,
    preferredLocation: row.preferred_location ?? null,
    registrationRequired: row.registration_required ?? null,
    registrationOpensAt: row.registration_opens_at ?? null,
    registrationClosesAt: row.registration_closes_at ?? null,
    attendeeCapacity: row.attendee_capacity ?? null,
    waitlistEnabled: row.waitlist_enabled ?? null,
    withdrawalPermitted: row.withdrawal_permitted ?? null,
  }));
}
