import {
  EventSubmissionError,
  toVenuePayload,
  venueFormSchema,
  type OperatingHours,
  type VenueBookingAtRisk,
  type VenueFormValues,
} from "@spm/shared";
import type { PostgrestError } from "@supabase/supabase-js";

import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

// AC08's four venue-period states — purely booking/block-derived, not
// operating-hours fit (that's a separate concern enforced only when a
// request is actually submitted).
export type VenueAvailabilityStatus = "available" | "pending" | "confirmed" | "blocked";

export const VENUE_AVAILABILITY_LABELS: Record<VenueAvailabilityStatus, string> = {
  available: "Available",
  pending: "Pending",
  confirmed: "Confirmed",
  blocked: "Blocked",
};

export type VenueSummary = {
  id: string;
  name: string;
  location: string;
  capacity: number;
  operatingHours: OperatingHours;
  description: string | null;
  accessibilityNotes: string | null;
  facilities: string[];
  layouts: string[];
  updatedAt: string;
  // AC09: who last updated the entry, alongside updatedAt — null for a venue
  // nobody has ever updated (created but not yet edited).
  updatedByName: string | null;
  // Venue Catalogue AC06: a nonzero count surfaces the "Needs Review" badge.
  needsReviewCount: number;
  // Only meaningful for a suggestion against a specific event's schedule
  // (listSuggestedVenues) — undefined for the plain catalogue (listVenues),
  // which has no event to check availability against.
  availabilityStatus?: VenueAvailabilityStatus;
};

export type VenueDetail = VenueFormValues & {
  updatedAt: string;
  updatedByName: string | null;
};

function operationError(message: string) {
  return new Error(message);
}

export async function listVenues(): Promise<VenueSummary[]> {
  const { data, error } = await supabase
    .from("venues")
    .select(
      `
        id,
        name,
        location,
        capacity,
        operating_hours,
        description,
        accessibility_notes,
        updated_at,
        updated_by_profile:profiles!venues_updated_by_fkey (full_name),
        venue_facilities (facility_name),
        venue_layouts (layout_name),
        venue_bookings (needs_review)
      `,
    )
    .order("updated_at", { ascending: false });

  if (error) throw operationError("We couldn't load the venue catalogue.");

  return data.map(
    (venue): VenueSummary => ({
      id: venue.id,
      name: venue.name,
      location: venue.location,
      capacity: venue.capacity,
      operatingHours: venue.operating_hours as unknown as OperatingHours,
      description: venue.description,
      accessibilityNotes: venue.accessibility_notes,
      facilities: venue.venue_facilities.map((facility) => facility.facility_name),
      layouts: venue.venue_layouts.map((layout) => layout.layout_name),
      updatedAt: venue.updated_at,
      updatedByName: venue.updated_by_profile?.full_name ?? null,
      needsReviewCount: venue.venue_bookings.filter((booking) => booking.needs_review)
        .length,
    }),
  );
}

type SuggestedVenueRow = {
  id: string;
  name: string;
  location: string;
  capacity: number;
  operating_hours: unknown;
  description: string | null;
  accessibility_notes: string | null;
  facilities: string[] | null;
  layouts: string[] | null;
  updated_at: string;
  availability_status: VenueAvailabilityStatus;
};

/**
 * "Automatically Suggest Matching Venues": venues that satisfy every
 * mandatory requirement of the given event. Goes through apps/backend rather
 * than calling the RPC directly — same split as event-submissions/
 * event-clarifications/event-decisions — the route only authenticates and
 * validates the path param; the matching rules live in
 * public.find_matching_venues (202609230001_find_matching_venues.sql,
 * extended by 202609260005 to compute availabilityStatus). Mapped into
 * VenueSummary so VenueCard renders these results unmodified, same as the
 * catalogue's own list.
 *
 * A venue with a Pending/Confirmed booking or a block is still included
 * here, not excluded — only a genuine requirement mismatch (capacity,
 * location, layout, accessibility, facilities) drops a venue from the list
 * entirely, so a coordinator can see "this fits, but isn't free right now"
 * rather than the venue silently vanishing. availabilityStatus reflects
 * AC08's four venue-period states purely from booking/block data — it does
 * not factor in operating-hours fit, which is a separate concern enforced
 * only when a request is actually submitted (AC07).
 *
 * needsReviewCount/updatedByName aren't meaningful for a suggestion (no
 * booking exists yet, and the RPC doesn't join profiles) — set to their
 * "nothing to show" defaults, which is harmless since this panel never
 * passes canManageVenues={true}.
 */
export async function listSuggestedVenues(eventId: string): Promise<VenueSummary[]> {
  let data: SuggestedVenueRow[];
  try {
    ({ data } = await apiFetch(`/events/${eventId}/suggested-venues`));
  } catch {
    throw operationError("We couldn't load suggested venues for this event.");
  }

  return (data ?? []).map(
    (venue): VenueSummary => ({
      id: venue.id,
      name: venue.name,
      location: venue.location,
      capacity: venue.capacity,
      operatingHours: venue.operating_hours as unknown as OperatingHours,
      description: venue.description,
      accessibilityNotes: venue.accessibility_notes,
      facilities: venue.facilities ?? [],
      layouts: venue.layouts ?? [],
      updatedAt: venue.updated_at,
      updatedByName: null,
      needsReviewCount: 0,
      availabilityStatus: venue.availability_status,
    }),
  );
}

export async function getVenue(venueId: string): Promise<VenueDetail> {
  const { data, error } = await supabase
    .from("venues")
    .select(
      `
        name,
        location,
        capacity,
        operating_hours,
        description,
        accessibility_notes,
        updated_at,
        updated_by_profile:profiles!venues_updated_by_fkey (full_name),
        venue_facilities (facility_name),
        venue_layouts (layout_name)
      `,
    )
    .eq("id", venueId)
    .maybeSingle();

  if (error || !data) {
    throw operationError(
      "This venue is unavailable or you do not have access to it.",
    );
  }

  return {
    name: data.name,
    location: data.location,
    capacity: data.capacity.toString(),
    operatingHours: data.operating_hours as unknown as OperatingHours,
    description: data.description ?? "",
    accessibilityNotes: data.accessibility_notes ?? "",
    facilities: data.venue_facilities.map((facility) => facility.facility_name),
    layouts: data.venue_layouts.map((layout) => layout.layout_name) as VenueFormValues["layouts"],
    updatedAt: data.updated_at,
    updatedByName: data.updated_by_profile?.full_name ?? null,
  };
}

/**
 * AC05/AC07: approved and pending bookings for this venue whose event has an
 * expected attendance — what the frontend checks a proposed capacity against
 * before saving, so the warning shows before the request even reaches
 * public.update_venue.
 */
export async function listAtRiskBookings(
  venueId: string,
): Promise<VenueBookingAtRisk[]> {
  const { data, error } = await supabase
    .from("venue_bookings")
    .select(
      `
        id,
        status,
        event_id,
        events (title, expected_attendance)
      `,
    )
    .eq("venue_id", venueId)
    .in("status", ["approved", "pending"]);

  if (error) throw operationError("We couldn't check this venue's bookings.");

  return data
    .filter((booking) => booking.events?.expected_attendance != null)
    .map((booking) => ({
      id: booking.id,
      eventId: booking.event_id,
      eventTitle: booking.events!.title,
      expectedAttendance: booking.events!.expected_attendance!,
      status: booking.status,
    }));
}

export async function createVenue(values: VenueFormValues) {
  const parsed = venueFormSchema.parse(values);
  const { data, error } = await supabase.rpc("create_venue", {
    p_venue: toVenuePayload(parsed),
  });

  if (error) throw mapVenueRpcError(error);
  return data as { venueId: string };
}

export async function updateVenue(venueId: string, values: VenueFormValues) {
  const parsed = venueFormSchema.parse(values);
  const { data, error } = await supabase.rpc("update_venue", {
    p_venue_id: venueId,
    p_venue: toVenuePayload(parsed),
  });

  if (error) throw mapVenueRpcError(error);
  return data as { venueId: string; flaggedBookingsCount: number };
}

/**
 * AC03/AC08. Mirrors apps/backend's mapSubmitEventRequestError
 * (event-submissions.route.ts): this write goes straight through
 * supabase.rpc rather than the Express backend (RLS + RPC is the
 * established pattern for catalogue writes — see save_event_draft), so the
 * same 23505/23514 -> EventSubmissionError translation happens here instead
 * of in a backend route.
 */
function mapVenueRpcError(error: PostgrestError): EventSubmissionError {
  if (error.code === "23505") {
    const issue = safeJsonParse(error.details) as
      | { field?: string; message?: string }
      | undefined;
    if (issue?.field && issue.message) {
      return new EventSubmissionError(issue.message, {
        [issue.field]: issue.message,
      });
    }
  }

  if (error.code === "23514") {
    const issues = safeJsonParse(error.details) as
      | Array<{ field: string; message: string }>
      | undefined;
    if (Array.isArray(issues)) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of issues) fieldErrors[issue.field] = issue.message;
      return new EventSubmissionError(
        "Check the highlighted fields and try again.",
        fieldErrors,
      );
    }
  }

  if (error.code === "42501") {
    return new EventSubmissionError(error.message);
  }

  return new EventSubmissionError(
    "This venue could not be saved. Your form values are still here.",
  );
}

function safeJsonParse(value: string | undefined | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
