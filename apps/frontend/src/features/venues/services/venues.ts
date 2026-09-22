import {
  EventSubmissionError,
  toVenuePayload,
  venueFormSchema,
  type VenueBookingAtRisk,
  type VenueFormValues,
} from "@spm/shared";
import type { PostgrestError } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase-client";

export type VenueSummary = {
  id: string;
  name: string;
  location: string;
  capacity: number;
  operatingHours: string;
  description: string | null;
  accessibilityNotes: string | null;
  facilities: string[];
  updatedAt: string;
  // AC09: who last updated the entry, alongside updatedAt — null for a venue
  // nobody has ever updated (created but not yet edited).
  updatedByName: string | null;
  // Venue Catalogue AC06: a nonzero count surfaces the "Needs Review" badge.
  needsReviewCount: number;
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
        venue_bookings (needs_review)
      `,
    )
    .order("name", { ascending: true });

  if (error) throw operationError("We couldn't load the venue catalogue.");

  return data.map(
    (venue): VenueSummary => ({
      id: venue.id,
      name: venue.name,
      location: venue.location,
      capacity: venue.capacity,
      operatingHours: venue.operating_hours,
      description: venue.description,
      accessibilityNotes: venue.accessibility_notes,
      facilities: venue.venue_facilities.map((facility) => facility.facility_name),
      updatedAt: venue.updated_at,
      updatedByName: venue.updated_by_profile?.full_name ?? null,
      needsReviewCount: venue.venue_bookings.filter((booking) => booking.needs_review)
        .length,
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
        venue_facilities (facility_name)
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
    operatingHours: data.operating_hours,
    description: data.description ?? "",
    accessibilityNotes: data.accessibility_notes ?? "",
    facilities: data.venue_facilities.map((facility) => facility.facility_name),
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
