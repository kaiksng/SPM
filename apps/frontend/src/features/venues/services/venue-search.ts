import {
  singaporeLocalToIso, venueSearchSchema, type VenueSearchValues,
  type OperatingHours,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";
import type { VenueSummary } from "@/features/venues/services/venues";

export async function searchAvailableVenues(
  eventId: string,
  values: VenueSearchValues,
): Promise<VenueSummary[]> {
  const parsed = venueSearchSchema.parse(values);
  const { data, error } = await supabase.rpc("search_available_venues", {
    p_event_id: eventId,
    p_starts_at: singaporeLocalToIso(parsed.startsAt),
    p_ends_at: singaporeLocalToIso(parsed.endsAt),
    p_min_capacity: Number(parsed.minimumCapacity),
    // undefined omits the argument so Postgres uses its `default null`
    // (same behaviour as sending null, which the generated types no longer allow).
    p_location: parsed.location.trim() || undefined,
    p_layout: parsed.layout || undefined,
    p_facilities: parsed.facilities,
    p_accessibility: parsed.accessibility.trim() || undefined,
  });
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    id: row.id, name: row.name, location: row.location, areaTags: [],
    capacity: row.capacity, operatingHours: row.operating_hours as unknown as OperatingHours,
    description: row.description, accessibilityNotes: row.accessibility_notes,
    facilities: row.facilities, layouts: row.layouts, updatedAt: row.updated_at,
    updatedByName: null, needsReviewCount: 0, availabilityStatus: "available",
    setupTimeMinutes: row.setup_time_minutes, turnaroundTimeMinutes: row.turnaround_time_minutes,
  }));
}
