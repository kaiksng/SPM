import type { Database } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type NotificationType = Database["public"]["Enums"]["notification_type"];

export type NotificationSummary = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  eventId: string | null;
  readAt: string | null;
  createdAt: string;
};

/**
 * The signed-in user's most recent notifications, newest first. RLS's
 * "users read their notifications" policy (recipient_id = auth.uid())
 * already scopes this — there's no query shape that can see another
 * user's rows.
 */
export async function listNotifications(limit = 20): Promise<NotificationSummary[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, type, title, message, event_id, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error("Your notifications are unavailable.");

  return (data ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    eventId: row.event_id,
    readAt: row.read_at,
    createdAt: row.created_at,
  }));
}

/** A lean count, separate from the capped list above, so the badge stays accurate beyond it. */
export async function getUnreadNotificationCount(): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

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
 * safe.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);

  if (error) throw new Error("Your notifications could not be marked read.");
}
