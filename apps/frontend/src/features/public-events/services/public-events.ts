import { supabase } from "@/lib/supabase-client";

/** Where registration stands for a signed-out visitor; no live numbers. */
export type PublicRegistrationState = "open" | "not_open" | "closed" | "full" | "not_required" | "being_updated";

export type PublicEventSummary = {
  id: string;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  bannerPath: string | null;
  opensAt: string | null;
  registration: PublicRegistrationState;
};

/**
 * Upcoming confirmed events, for the public main page — including ones that
 * don't take registrations. public.list_public_events (last 202611010001)
 * returns only what that page shows, so it works before sign-in without
 * opening events up under RLS.
 */
export async function listPublicEvents(limit = 6, now: Date = new Date()): Promise<PublicEventSummary[]> {
  const { data, error } = await supabase.rpc("list_public_events", { p_limit: limit });

  if (error) throw new Error("We couldn't load upcoming events.");

  return (data ?? []).map((row) => {
    const opensAt = row.registration_opens_at ?? null;
    const closesAt = row.registration_closes_at ?? null;
    return {
      id: row.id,
      title: row.title,
      startsAt: row.starts_at ?? null,
      endsAt: row.ends_at ?? null,
      location: row.location ?? null,
      bannerPath: row.banner_path ?? null,
      opensAt,
      // The same order as computeRegistrationState (@spm/shared).
      // A Confirmed event back under review: its venue is to be confirmed.
      registration: row.being_updated
        ? "being_updated"
        : !row.registration_required
        ? "not_required"
        : opensAt && now < new Date(opensAt)
          ? "not_open"
          : closesAt && now > new Date(closesAt)
            ? "closed"
            : row.is_full
              ? "full"
              : "open",
    };
  });
}
