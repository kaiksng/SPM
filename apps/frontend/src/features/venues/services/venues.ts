import {
  EventSubmissionError,
  toVenuePayload,
  venueFormSchema,
  type OperatingHours,
  type VenueBookingAtRisk,
  type VenueFormValues,
} from "@spm/shared";
import type { PostgrestError } from "@supabase/supabase-js";

import { ApiError, apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";

// The venue-period states (SPM-24 AC07) — purely booking/block-derived, not
// operating-hours fit (that's a separate concern enforced only when a
// request is actually submitted).
export type VenueAvailabilityStatus = "available" | "pending" | "confirmed" | "blocked";

export const VENUE_AVAILABILITY_LABELS: Record<VenueAvailabilityStatus, string> = {
  available: "Available",
  pending: "Pending Booking",
  confirmed: "Confirmed",
  blocked: "Blocked",
};

export type VenueSummary = {
  id: string;
  name: string;
  location: string;
  areaTags: string[];
  capacity: number;
  operatingHours: OperatingHours;
  description: string | null;
  accessibilityNotes: string | null;
  facilities: string[];
  layouts: string[];
  // The venue's own uploaded photo, null when none has been uploaded (the
  // catalogue falls back to a stock photo by layout type instead). Always
  // null for listSuggestedVenues, which doesn't surface this field.
  imageUrl: string | null;
  updatedAt: string;
  // AC09: who last updated the entry, alongside updatedAt — null for a venue
  // nobody has ever updated (created but not yet edited).
  updatedByName: string | null;
  // Venue Catalogue AC06: a nonzero count surfaces the "Needs Review" badge.
  needsReviewCount: number;
  setupTimeMinutes?: number;
  turnaroundTimeMinutes?: number;
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

function isMissingAreaTags(error: PostgrestError | null): boolean {
  return error?.code === "42703" && error.message.includes("venues.area_tags");
}

export async function listVenues(): Promise<VenueSummary[]> {
  let { data, error } = await supabase
    .from("venues")
    .select(
      `
        id,
        name,
        location,
        area_tags,
        capacity,
        operating_hours,
        description,
        accessibility_notes,
        image_url,
        updated_at,
        setup_time_minutes,
        turnaround_time_minutes,
        updated_by_profile:profiles!venues_updated_by_fkey (full_name),
        venue_facilities (facility_name),
        venue_layouts (layout_name),
        venue_bookings (needs_review)
      `,
    )
    .order("updated_at", { ascending: false });

  // Keep the catalogue readable while the database owner applies the area
  // migration. Only this known missing-column error gets a legacy retry.
  if (isMissingAreaTags(error)) {
    const legacy = await supabase
      .from("venues")
      .select(`
        id, name, location, capacity, operating_hours, description,
        accessibility_notes, image_url, updated_at, setup_time_minutes, turnaround_time_minutes,
        updated_by_profile:profiles!venues_updated_by_fkey (full_name),
        venue_facilities (facility_name), venue_layouts (layout_name),
        venue_bookings (needs_review)
      `)
      .order("updated_at", { ascending: false });
    data = legacy.data?.map((venue) => ({ ...venue, area_tags: [] })) ?? null;
    error = legacy.error;
  }

  if (error || !data) throw operationError("We couldn't load the venue catalogue.");

  return data.map(
    (venue): VenueSummary => ({
      id: venue.id,
      name: venue.name,
      location: venue.location,
      areaTags: venue.area_tags,
      capacity: venue.capacity,
      operatingHours: venue.operating_hours as unknown as OperatingHours,
      description: venue.description,
      accessibilityNotes: venue.accessibility_notes,
      facilities: venue.venue_facilities.map((facility) => facility.facility_name),
      layouts: venue.venue_layouts.map((layout) => layout.layout_name),
      imageUrl: venue.image_url,
      updatedAt: venue.updated_at,
      updatedByName: venue.updated_by_profile?.full_name ?? null,
      needsReviewCount: venue.venue_bookings.filter((booking) => booking.needs_review)
        .length,
      setupTimeMinutes: venue.setup_time_minutes,
      turnaroundTimeMinutes: venue.turnaround_time_minutes,
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
  setup_time_minutes: number;
  turnaround_time_minutes: number;
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
      areaTags: [],
      capacity: venue.capacity,
      operatingHours: venue.operating_hours as unknown as OperatingHours,
      description: venue.description,
      accessibilityNotes: venue.accessibility_notes,
      facilities: venue.facilities ?? [],
      layouts: venue.layouts ?? [],
      imageUrl: null,
      updatedAt: venue.updated_at,
      updatedByName: null,
      needsReviewCount: 0,
      availabilityStatus: venue.availability_status,
      setupTimeMinutes: venue.setup_time_minutes,
      turnaroundTimeMinutes: venue.turnaround_time_minutes,
    }),
  );
}

export async function getVenue(venueId: string): Promise<VenueDetail> {
  let { data, error } = await supabase
    .from("venues")
    .select(
      `
        name,
        location,
        area_tags,
        capacity,
        operating_hours,
        description,
        accessibility_notes,
        image_url,
        updated_at,
        setup_time_minutes,
        turnaround_time_minutes,
        updated_by_profile:profiles!venues_updated_by_fkey (full_name),
        venue_facilities (facility_name),
        venue_layouts (layout_name)
      `,
    )
    .eq("id", venueId)
    .maybeSingle();

  if (isMissingAreaTags(error)) {
    const legacy = await supabase
      .from("venues")
      .select(`
        name, location, capacity, operating_hours, description,
        accessibility_notes, image_url, updated_at, setup_time_minutes, turnaround_time_minutes,
        updated_by_profile:profiles!venues_updated_by_fkey (full_name),
        venue_facilities (facility_name), venue_layouts (layout_name)
      `)
      .eq("id", venueId)
      .maybeSingle();
    data = legacy.data ? { ...legacy.data, area_tags: [] } : null;
    error = legacy.error;
  }

  if (error || !data) {
    throw operationError(
      "This venue is unavailable or you do not have access to it.",
    );
  }

  return {
    name: data.name,
    location: data.area_tags.includes(data.location) ? "" : data.location,
    areaTags: data.area_tags.slice(0, 1),
    capacity: data.capacity.toString(),
    operatingHours: data.operating_hours as unknown as OperatingHours,
    description: data.description ?? "",
    accessibilityNotes: data.accessibility_notes ?? "",
    facilities: data.venue_facilities.map((facility) => facility.facility_name),
    layouts: data.venue_layouts.map((layout) => layout.layout_name) as VenueFormValues["layouts"],
    imageUrl: data.image_url ?? "",
    updatedAt: data.updated_at,
    updatedByName: data.updated_by_profile?.full_name ?? null,
    setupTimeMinutes: data.setup_time_minutes.toString(),
    turnaroundTimeMinutes: data.turnaround_time_minutes.toString(),
  };
}

export type VenueBufferTimeChange = {
  id: number;
  field: "setup_time_minutes" | "turnaround_time_minutes";
  previousValue: number;
  newValue: number;
  changedByName: string | null;
  changedAt: string;
};

/**
 * AC: each setup/turnaround change, newest first, with who made it and the
 * before/after value. RLS's "venue staff view buffer time history" policy
 * already scopes this to venue_staff — there's no write policy on this
 * table at all, only update_venue (security definer) inserts into it.
 */
export async function listVenueBufferTimeChanges(
  venueId: string,
): Promise<VenueBufferTimeChange[]> {
  const { data, error } = await supabase
    .from("venue_buffer_time_changes")
    .select(
      "id, field_name, previous_value, new_value, changed_at, changed_by:profiles (full_name)",
    )
    .eq("venue_id", venueId)
    .order("changed_at", { ascending: false });

  if (error) throw operationError("This venue's change history is unavailable.");

  return (data ?? []).map((row) => ({
    id: row.id,
    field: row.field_name as VenueBufferTimeChange["field"],
    previousValue: row.previous_value,
    newValue: row.new_value,
    changedByName: row.changed_by?.full_name ?? null,
    changedAt: row.changed_at,
  }));
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

export type FlaggedBookingConflict = {
  id: number;
  bookingId: string;
  eventId: string;
  eventTitle: string;
  venueId: string;
  venueName: string;
  venueLayouts: string[];
  startsAt: string;
  endsAt: string;
  // The event's CURRENT assigned coordinator (events.assigned_coordinator_id),
  // not venue_bookings.requested_by — a reassignment after the request was
  // submitted would otherwise leave this pointing at someone no longer on
  // the event.
  coordinatorName: string | null;
  // Set on the later-created booking's own row (false on the earlier one).
  // That booking is the one that has to move: only it blocks its event's
  // safety check, and its coordinator's Venue step says so (202611010010).
  isResponsible: boolean;
  cause: string;
  flaggedAt: string;
  // Exactly one of these is set, matching
  // venue_booking_conflicts_one_other_side.
  conflictingEventTitle: string | null;
  conflictingBlockReason: string | null;
};

/**
 * Every currently-unresolved conflict, newest first — Venue Staff's
 * "Flagged" queue. RLS's "venue staff view conflicts" policy already grants
 * unrestricted select, so this reads straight through Supabase.
 */
export async function listFlaggedBookingConflicts(): Promise<FlaggedBookingConflict[]> {
  const { data, error } = await supabase
    .from("venue_booking_conflicts")
    .select(
      `
        id, cause, is_responsible, flagged_at,
        booking:venue_bookings!venue_booking_conflicts_booking_id_fkey (
          id, starts_at, ends_at, event_id,
          events (
            title,
            coordinator:profiles!events_assigned_coordinator_id_fkey (full_name)
          ),
          venues (id, name, venue_layouts (layout_name))
        ),
        conflicting_booking:venue_bookings!venue_booking_conflicts_conflicting_booking_id_fkey (
          events (title)
        ),
        conflicting_block:venue_unavailability!venue_booking_conflicts_conflicting_block_id_fkey (
          reason
        )
      `,
    )
    .is("resolved_at", null)
    .order("flagged_at", { ascending: false });

  if (error) throw operationError("Flagged bookings are unavailable.");

  return (data ?? [])
    .filter((row) => row.booking)
    .map(
      (row): FlaggedBookingConflict => ({
        id: row.id,
        bookingId: row.booking!.id,
        eventId: row.booking!.event_id,
        eventTitle: row.booking!.events?.title ?? "Unknown event",
        venueId: row.booking!.venues?.id ?? "",
        venueName: row.booking!.venues?.name ?? "Unknown venue",
        venueLayouts: row.booking!.venues?.venue_layouts.map((layout) => layout.layout_name) ?? [],
        startsAt: row.booking!.starts_at,
        endsAt: row.booking!.ends_at,
        coordinatorName: row.booking!.events?.coordinator?.full_name ?? null,
        isResponsible: row.is_responsible,
        cause: row.cause,
        flaggedAt: row.flagged_at,
        conflictingEventTitle: row.conflicting_booking?.events?.title ?? null,
        conflictingBlockReason: row.conflicting_block?.reason ?? null,
      }),
    );
}

const VENUE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const VENUE_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Uploads a venue photo to the venue-images bucket and returns its public
 * URL. Type/size are checked here too, not just in the bucket config
 * (202610180003_venue_images.sql) -- the same "screen the obvious bad
 * input before a round trip" reasoning createVenue/updateVenue already use
 * for every other field. The storage path is a random id, decoupled from
 * the venue's own id, so this works the same whether creating a brand-new
 * venue or editing an existing one.
 */
export async function uploadVenueImage(file: File): Promise<string> {
  const extension = VENUE_IMAGE_MIME_EXTENSIONS[file.type];
  if (!extension) {
    throw operationError("Upload a JPG, PNG, or WebP image.");
  }
  if (file.size > VENUE_IMAGE_MAX_BYTES) {
    throw operationError("The image must be smaller than 5MB.");
  }

  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("venue-images").upload(path, file, {
    contentType: file.type,
  });
  if (error) throw operationError("This image could not be uploaded.");

  return supabase.storage.from("venue-images").getPublicUrl(path).data.publicUrl;
}

export async function createVenue(values: VenueFormValues) {
  const parsed = venueFormSchema.parse(values);
  await ensureAreaTagsAvailable();
  const { data, error } = await supabase.rpc("create_venue", {
    p_venue: toVenuePayload(parsed),
  });

  if (error) throw mapVenueRpcError(error);
  return data as { venueId: string };
}

/**
 * Goes through apps/backend's service client, not a direct supabase-js
 * call: update_venue now re-checks venue_booking_conflicts when setup/
 * turnaround time changes, which inserts `notifications` rows — no INSERT
 * policy for regular users. create_venue above is unaffected (a brand-new
 * venue has no bookings to conflict with) and stays direct.
 */
export async function updateVenue(venueId: string, values: VenueFormValues) {
  const parsed = venueFormSchema.parse(values);
  await ensureAreaTagsAvailable();
  try {
    const { data } = await apiFetch(`/venues/${venueId}/update`, {
      method: "POST",
      body: JSON.stringify({ venue: toVenuePayload(parsed) }),
    });
    return data as { venueId: string; flaggedBookingsCount: number };
  } catch (error) {
    throw mapVenueApiError(error);
  }
}

/** Venue Staff can run a conflict re-check for a venue or all venues. */
export async function recheckVenueConflicts(
  venueId: string,
): Promise<{ venueId: string; flaggedCount: number; clearedCount: number; activeCount: number }> {
  const { data } = await apiFetch(`/venues/${venueId}/recheck-conflicts`, { method: "POST" });
  return data as { venueId: string; flaggedCount: number; clearedCount: number; activeCount: number };
}

export async function recheckAllVenueConflicts(): Promise<{
  flaggedCount: number;
  clearedCount: number;
}> {
  const { data } = await apiFetch("/venues/recheck-conflicts", { method: "POST" });
  return data as { flaggedCount: number; clearedCount: number };
}

async function ensureAreaTagsAvailable() {
  const { error } = await supabase.from("venues").select("area_tags").limit(0);
  if (isMissingAreaTags(error)) {
    throw new EventSubmissionError(
      "Venue area tags are not available yet. Ask the database owner to apply the venue-area migration before saving.",
    );
  }
  if (error) {
    throw new EventSubmissionError("Could not check venue area tags. Try again.");
  }
}

/**
 * AC03/AC08. Mirrors apps/backend's mapSubmitEventRequestError
 * (event-submissions.route.ts): this write goes straight through
 * supabase.rpc rather than the Express backend (RLS + RPC is the
 * established pattern for catalogue writes — see save_event_draft), so the
 * same 23505/23514 -> EventSubmissionError translation happens here instead
 * of in a backend route.
 */
/**
 * updateVenue's counterpart to mapVenueRpcError below, now that it goes
 * through the backend: apps/backend's mapVenueError (venue-management.
 * route.ts) already did the 23505/23514/42501/22P02 translation into an
 * ApplicationError with a `fields` array — this just reshapes that into the
 * same EventSubmissionError/fieldErrors shape VenueForm already expects, so
 * callers don't need to know which path a given write takes.
 */
function mapVenueApiError(error: unknown): EventSubmissionError {
  if (error instanceof ApiError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of (error.fields ?? []) as Array<{ field: string; message: string }>)
      fieldErrors[issue.field] = issue.message;
    return new EventSubmissionError(
      error.message,
      Object.keys(fieldErrors).length > 0 ? fieldErrors : undefined,
    );
  }

  return new EventSubmissionError(
    error instanceof Error ? error.message : "This venue could not be saved. Try again.",
  );
}

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

  if (error.code === "22P02" && error.message.includes("room_layout")) {
    return new EventSubmissionError(
      "Custom room layouts are not available yet. Ask the database owner to apply the custom-layout migration before saving.",
    );
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
