import type { Database } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type NotificationSummary = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  eventId: string | null;
  // SPM-85: the venue a booking notification is about, so Venue Staff can be
  // taken to that venue's Activity log. Null for every other notification.
  venueId: string | null;
  readAt: string | null;
  // For a scheduled hold reminder, this is scheduled_for — when it actually
  // became relevant to the recipient — not the row's insert time (hold
  // placement, possibly days earlier). Every other notification type has no
  // scheduled_for, so this is just created_at for them, same as before.
  createdAt: string;
};

/**
 * A hold's reminder notifications (venue_hold_expiring_soon/
 * venue_hold_expired) are inserted up front, at hold-placement time, each
 * carrying a future `scheduled_for` — there's no cron to insert them at the
 * moment they actually become relevant, so instead they sit invisible until
 * then. Every pre-existing notification type has scheduled_for = null,
 * which this filter always matches, so it's a no-op for them.
 */
function scheduledForFilter(): string {
  return `scheduled_for.is.null,scheduled_for.lte.${new Date().toISOString()}`;
}

/**
 * The signed-in user's most recent notifications, newest first — "most
 * recent" meaning when each one actually became relevant (scheduled_for for
 * a hold reminder, created_at for everything else), not necessarily when its
 * row was inserted. A reminder's row is inserted at hold-placement time,
 * possibly days before it's shown, so ordering by created_at alone would
 * bury it under newer, unrelated notifications the moment it finally
 * appears. PostgREST can't order by `coalesce(scheduled_for, created_at)`
 * directly, so this over-fetches by created_at (reminders are the only rows
 * whose effective time can lag their insert time, and that lag is bounded —
 * at most the hold's own duration) and re-sorts client-side before slicing
 * to `limit`.
 *
 * RLS's "users read their notifications" policy (recipient_id = auth.uid())
 * already scopes this — there's no query shape that can see another
 * user's rows.
 */
export async function listNotifications(limit = 20): Promise<NotificationSummary[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, event_id, read_at, created_at, scheduled_for, venue_bookings (venue_id)")
    .or(scheduledForFilter())
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (error) throw new Error("Your notifications are unavailable.");

  return (data ?? [])
    .map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      eventId: row.event_id,
      venueId: row.venue_bookings?.venue_id ?? null,
      readAt: row.read_at,
      createdAt: row.scheduled_for ?? row.created_at,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** A lean count, separate from the capped list above, so the badge stays accurate beyond it. */
export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null)
    .or(scheduledForFilter());

  if (error) throw new Error("Your unread notification count is unavailable.");

  return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error("This notification could not be marked read.");
}

/**
 * RLS's "users mark their notifications read" policy already scopes this to
 * the caller's own rows (recipient_id = auth.uid()) — the read_at filter
 * below is just to avoid rewriting already-read rows, not what makes this
 * safe. The scheduled_for filter stops this from marking a not-yet-visible
 * hold reminder read before the coordinator was ever shown it.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .or(scheduledForFilter());

  if (error) throw new Error("Your notifications could not be marked read.");
}
