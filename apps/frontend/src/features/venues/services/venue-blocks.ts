import {
  singaporeLocalToIso,
  venueBlockSchema,
  type VenueBlockFormValues,
  type VenueBlockReasonCategory,
} from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type VenueBlock = {
  id: string;
  venueId: string;
  reasonCategory: VenueBlockReasonCategory;
  reason: string | null;
  startsAt: string;
  endsAt: string;
  removedAt: string | null;
  removedBy: string | null;
};

/** A booking or active hold that a venue block overlaps (buffers included). */
export type AffectedBooking = {
  bookingId: string;
  eventId: string;
  eventTitle: string;
  coordinatorId: string | null;
  coordinatorName: string | null;
  venueName?: string;
  status: string;
  startsAt: string;
  endsAt: string;
};

export type CreatedVenueBlock = {
  blockId: string;
  affected: AffectedBooking[];
};

export async function listVenueBlocks(venueId: string): Promise<VenueBlock[]> {
  const { data, error } = await supabase.from("venue_unavailability")
    .select("id, venue_id, reason_category, reason, starts_at, ends_at, removed_at, removed_by")
    .eq("venue_id", venueId).order("starts_at", { ascending: false });
  if (error) throw new Error("We couldn't load this venue's block history.");
  return data.map((row) => ({
    id: row.id, venueId: row.venue_id, reasonCategory: row.reason_category, reason: row.reason,
    startsAt: row.starts_at, endsAt: row.ends_at,
    removedAt: row.removed_at, removedBy: row.removed_by,
  }));
}

/**
 * SPM-83: the bookings a block over this period would disrupt, so Venue Staff
 * can confirm before saving. Overlap includes each booking's setup/turnaround.
 */
export async function previewVenueBlockImpact(
  values: Pick<VenueBlockFormValues, "venueId" | "startsAt" | "endsAt">,
): Promise<AffectedBooking[]> {
  const { data, error } = await supabase.rpc("preview_venue_block_impact", {
    p_venue_id: values.venueId,
    p_starts_at: singaporeLocalToIso(values.startsAt),
    p_ends_at: singaporeLocalToIso(values.endsAt),
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    bookingId: row.booking_id,
    eventId: row.event_id,
    eventTitle: row.event_title,
    coordinatorId: row.coordinator_id,
    coordinatorName: row.coordinator_name,
    venueName: row.venue_name,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}

type AffectedBookingJson = {
  bookingId: string;
  eventId: string;
  eventTitle: string;
  coordinatorId: string | null;
  coordinatorName: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
};

export async function createVenueBlock(values: VenueBlockFormValues): Promise<CreatedVenueBlock> {
  const parsed = venueBlockSchema.parse(values);
  const { data, error } = await supabase.rpc("create_venue_block", {
    p_venue_id: parsed.venueId,
    p_reason: parsed.reason,
    p_reason_category: parsed.reasonCategory,
    p_starts_at: singaporeLocalToIso(parsed.startsAt),
    p_ends_at: singaporeLocalToIso(parsed.endsAt),
  });
  if (error) throw new Error(error.message);
  const result = data as { blockId: string; affected: AffectedBookingJson[] };
  return { blockId: result.blockId, affected: result.affected ?? [] };
}

/** SPM-83: shorten an active block; bookings it no longer overlaps are cleared. */
export async function shortenVenueBlock(
  blockId: string,
  startsAt: string,
  endsAt: string,
): Promise<{ clearedCount: number }> {
  const { data, error } = await supabase.rpc("update_venue_block", {
    p_block_id: blockId,
    p_starts_at: singaporeLocalToIso(startsAt),
    p_ends_at: singaporeLocalToIso(endsAt),
  });
  if (error) throw new Error(error.message);
  return { clearedCount: (data as { clearedCount: number }).clearedCount };
}

export async function removeVenueBlock(blockId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_venue_block", { p_block_id: blockId });
  if (error) throw new Error(error.message);
}
