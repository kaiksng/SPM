import { singaporeLocalToIso, venueBlockSchema, type VenueBlockFormValues } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type VenueBlock = {
  id: string;
  venueId: string;
  reason: string | null;
  startsAt: string;
  endsAt: string;
  removedAt: string | null;
  removedBy: string | null;
};

export async function listVenueBlocks(venueId: string): Promise<VenueBlock[]> {
  const { data, error } = await supabase.from("venue_unavailability")
    .select("id, venue_id, reason, starts_at, ends_at, removed_at, removed_by")
    .eq("venue_id", venueId).order("starts_at", { ascending: false });
  if (error) throw new Error("We couldn't load this venue's block history.");
  return data.map((row) => ({
    id: row.id, venueId: row.venue_id, reason: row.reason,
    startsAt: row.starts_at, endsAt: row.ends_at,
    removedAt: row.removed_at, removedBy: row.removed_by,
  }));
}

export async function createVenueBlock(values: VenueBlockFormValues): Promise<void> {
  const parsed = venueBlockSchema.parse(values);
  const { error } = await supabase.rpc("create_venue_block", {
    p_venue_id: parsed.venueId,
    p_reason: parsed.reason,
    p_starts_at: singaporeLocalToIso(parsed.startsAt),
    p_ends_at: singaporeLocalToIso(parsed.endsAt),
  });
  if (error) throw new Error(error.message);
}

export async function removeVenueBlock(blockId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_venue_block", { p_block_id: blockId });
  if (error) throw new Error(error.message);
}
