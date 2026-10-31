import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { Menu, MenuContent, MenuTrigger } from "@/components/ui/menu";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationSummary,
  type NotificationType,
} from "@/features/notifications/services/notifications";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

// Coordinator-facing: the hold itself is the point, and Confirm lives on
// the event's venue sub-page, not the event detail page — so these skip
// straight there instead of making the coordinator click through.
const COORDINATOR_VENUE_HOLD_TYPES = new Set<NotificationType>([
  "venue_hold_placed",
  "venue_hold_expiring_soon",
  "venue_hold_expired",
]);

// SPM-83: a venue block disrupted the coordinator's booking (or cleared the
// disruption again). The venue sub-page is where they arrange the alternative.
const COORDINATOR_VENUE_DISRUPTION_TYPES = new Set<NotificationType>([
  "venue_booking_disrupted",
  "venue_disruption_cleared",
]);

// A venue booking decision (approved or rejected, including for a
// replacement): the change history lists each booking with its outcome and,
// for a rejection, the reason Venue Staff gave.
const VENUE_DECISION_TYPES = new Set<NotificationType>(["venue_decision"]);

// Venue-staff-facing: see the comment below on why these go to
// /venue-requests, same as "venue_request".
const VENUE_STAFF_REQUEST_TYPES = new Set<NotificationType>([
  "venue_request",
  "venue_hold_confirmed",
  "venue_request_withdrawn",
]);

// A venue conflict flagged or cleared (recheck_venue_conflicts): Venue Staff
// open the Flagged page; the events' coordinators, who are told too
// (202611010002) but can't open that page, go to the event's venue page.
const VENUE_STAFF_CONFLICT_TYPES = new Set<NotificationType>([
  "venue_conflict_flagged",
  "venue_conflict_resolved",
]);

/**
 * Where selecting a notification should go. Every type except the
 * venue-staff ones above is organiser/coordinator-facing, and both of those
 * roles can always reach an event's own detail page — see navigation.ts's
 * ROLE_NAV_ITEM_IDS. The venue-staff ones go to venue_staff instead, who
 * can't reach /events/:id at all (no "events" nav section); the page where
 * they actually act on a request is the flat /venue-requests list, not a
 * per-request route, so that's the target regardless of eventId.
 */
function notificationDestination(
  notification: NotificationSummary,
  role: string | undefined,
): string | undefined {
  // A withdrawn or cancelled booking is logged on the venue's Activity section.
  if (notification.type === "venue_request_withdrawn" && notification.venueId) {
    return `/venues/${notification.venueId}#activity`;
  }
  if (VENUE_STAFF_REQUEST_TYPES.has(notification.type)) return "/venue-requests";
  if (VENUE_STAFF_CONFLICT_TYPES.has(notification.type)) {
    if (role === "venue_staff") return "/flagged-bookings";
    return notification.eventId ? `/events/${notification.eventId}/venue` : undefined;
  }
  // SPM-39: an applied change request flagged arrangements for staff who
  // can't open the event page — send each to where they review them.
  if (notification.type === "venue_change_review") {
    return notification.venueId ? `/venues/${notification.venueId}` : "/venues";
  }
  if (notification.type === "equipment_change_review") return "/equipment";
  // A coordinator requested an event's equipment: staff arrange it there.
  if (notification.type === "equipment_requested") return "/equipment";
  if (notification.type === "safety_review_reset") return "/safety-checks";
  // Attendee-facing: an attendee has no "events" nav section (see
  // navigation.ts) and can't reach /events/:id at all — their own copy of
  // the event lives at /browse-events/:id instead.
  if (notification.type === "waitlist_promoted") {
    return notification.eventId ? `/browse-events/${notification.eventId}` : undefined;
  }
  if (!notification.eventId) return undefined;
  if (VENUE_DECISION_TYPES.has(notification.type)) return `/events/${notification.eventId}/history`;
  // The organiser must set up or fix registration: open its section.
  if (notification.type === "registration_update") {
    return `/events/${notification.eventId}#registration`;
  }
  if (
    COORDINATOR_VENUE_HOLD_TYPES.has(notification.type) ||
    COORDINATOR_VENUE_DISRUPTION_TYPES.has(notification.type)
  ) {
    return `/events/${notification.eventId}/venue`;
  }
  return `/events/${notification.eventId}`;
}

/**
 * A bell in the top nav with an unread-count badge, opening a panel of the
 * signed-in user's notifications. Fetches once on mount — same pattern as
 * every other page-level component in this app (no polling/realtime
 * precedent anywhere) — then updates local state optimistically after a
 * mark-read call.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const navigate = useNavigate();
  const { profile } = useAuth();

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([listNotifications(), getUnreadNotificationCount()])
      .then(([list, count]) => {
        if (!active) return;
        setNotifications(list);
        setUnreadCount(count);
      })
      .catch(() => {
        // Leave the panel showing an empty list rather than an error state —
        // notifications are a convenience, not a blocking resource.
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleSelect(notification: NotificationSummary) {
    if (notification.readAt === null) {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      markNotificationRead(notification.id).catch(() => {
        // Local state already reflects "read"; a failed write here just
        // means the server disagrees next time the list is refetched.
      });
    }

    setOpen(false);
    const destination = notificationDestination(notification, profile?.role);
    if (destination) navigate(destination);
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0) return;
    const readAt = new Date().toISOString();
    setNotifications((current) =>
      current.map((item) => (item.readAt === null ? { ...item, readAt } : item)),
    );
    setUnreadCount(0);
    markAllNotificationsRead().catch(() => {
      // Same tradeoff as handleSelect: optimistic local update, no rollback.
    });
  }

  return (
    <Menu open={open} onOpenChange={setOpen}>
      <MenuTrigger
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      >
        <Bell />
        {unreadCount > 0 && (
          <span className="bg-destructive absolute top-0.5 right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </MenuTrigger>

      <MenuContent className="w-80 max-h-96 overflow-y-auto p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
            className="text-primary text-xs font-medium hover:underline disabled:pointer-events-none disabled:text-muted-foreground/50 disabled:no-underline"
          >
            Mark all as read
          </button>
        </div>

        {loading ? (
          <div className="text-muted-foreground px-3 py-8 text-center text-sm">
            Loading…
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">You&apos;re all caught up</p>
            <p className="text-muted-foreground mt-1 text-xs">
              No notifications yet — updates about your events will show up here.
            </p>
          </div>
        ) : (
          notifications.map((notification) => {
            const unread = notification.readAt === null;
            return (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleSelect(notification)}
                disabled={!notificationDestination(notification, profile?.role)}
                className={cn(
                  "block w-full border-b px-3 py-2.5 text-left last:border-b-0",
                  unread ? "bg-muted/60" : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      unread ? "bg-primary" : "bg-transparent",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-sm leading-snug",
                        unread ? "font-semibold" : "font-medium text-foreground/80",
                      )}
                    >
                      {notification.title}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs leading-snug">
                      {notification.message}
                    </p>
                    <p className="text-muted-foreground/70 mt-1 text-[11px]">
                      {dateTimeFormatter.format(new Date(notification.createdAt))}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </MenuContent>
    </Menu>
  );
}
