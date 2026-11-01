import { beforeEach, describe, expect, it, vi } from "vitest";

const orderMock = vi.fn();
const limitMock = vi.fn();
const selectOrMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const isMock = vi.fn();
const isOrMock = vi.fn();
const updateMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "./notifications";

beforeEach(() => {
  vi.clearAllMocks();
  orderMock.mockReturnValue({ limit: limitMock });
  limitMock.mockResolvedValue({ data: [], error: null });
  selectOrMock.mockReturnValue({ order: orderMock });
  selectMock.mockReturnValue({ or: selectOrMock, order: orderMock, head: undefined });
  eqMock.mockResolvedValue({ error: null });
  isOrMock.mockResolvedValue({ error: null });
  isMock.mockReturnValue({ or: isOrMock });
  updateMock.mockReturnValue({ eq: eqMock, is: isMock });
  fromMock.mockReturnValue({ select: selectMock, update: updateMock });
});

describe("listNotifications", () => {
  // SPM-76 AC01: newest first, with message, related event and time.
  it("orders by newest first and maps rows to the summary shape", async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        {
          id: "n1",
          type: "decision",
          title: "Event approved",
          message: "Your event was approved.",
          event_id: "e1",
          read_at: null,
          created_at: "2026-10-06T09:00:00Z",
          scheduled_for: null,
          venue_bookings: { venue_id: "venue-1" },
        },
      ],
      error: null,
    });

    const result = await listNotifications();

    expect(fromMock).toHaveBeenCalledWith("notifications");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(60);
    expect(result).toEqual([
      {
        id: "n1",
        type: "decision",
        title: "Event approved",
        message: "Your event was approved.",
        eventId: "e1",
        venueId: "venue-1",
        readAt: null,
        createdAt: "2026-10-06T09:00:00Z",
      },
    ]);
  });

  // SPM-75 AC05: the "expires soon" reminder is inserted when the hold is
  // placed, scheduled 24 hours before expiry, and must stay hidden until then.
  it("SPM-75 AC05: only asks for notifications that are due by now", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2099-04-04T02:00:00.000Z"));
    try {
      await listNotifications();
    } finally {
      vi.useRealTimers();
    }

    expect(selectOrMock).toHaveBeenCalledWith(
      "scheduled_for.is.null,scheduled_for.lte.2099-04-04T02:00:00.000Z",
    );
  });

  it("sorts by scheduled_for over created_at for a reminder whose row was inserted earlier", async () => {
    limitMock.mockResolvedValueOnce({
      data: [
        // Inserted most recently (hold placed just now) but immediately
        // visible — no scheduled_for, so its created_at is also its
        // effective time.
        {
          id: "placed-now",
          type: "venue_hold_placed",
          title: "Venue request on hold",
          message: "...",
          event_id: "e1",
          read_at: null,
          created_at: "2026-10-07T09:41:00Z",
          scheduled_for: null,
        },
        // Inserted days ago (hold placed then) but only just became visible
        // — should sort above the row inserted a minute ago, by its
        // scheduled_for, not its stale created_at.
        {
          id: "reminder-just-fired",
          type: "venue_hold_expiring_soon",
          title: "Venue hold expires soon",
          message: "...",
          event_id: "e2",
          read_at: null,
          created_at: "2026-10-01T08:00:00Z",
          scheduled_for: "2026-10-07T09:42:00Z",
        },
      ],
      error: null,
    });

    const result = await listNotifications();

    expect(result.map((n) => n.id)).toEqual(["reminder-just-fired", "placed-now"]);
    expect(result[0]?.createdAt).toBe("2026-10-07T09:42:00Z");
  });

  it("throws a friendly error when the query fails", async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await expect(listNotifications()).rejects.toThrow(
      "Your notifications are unavailable.",
    );
  });
});

describe("getUnreadNotificationCount", () => {
  // SPM-76 AC02: the badge count is the number of unread notifications.
  it("filters to unread rows and returns the count", async () => {
    const headSelectMock = vi.fn().mockReturnValue({ is: isMock });
    fromMock.mockReturnValueOnce({ select: headSelectMock });
    isOrMock.mockResolvedValueOnce({ count: 3, error: null });

    const result = await getUnreadNotificationCount();

    expect(headSelectMock).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(isMock).toHaveBeenCalledWith("read_at", null);
    expect(result).toBe(3);
  });
});

describe("markNotificationRead", () => {
  // SPM-76 AC03: mark one notification as read.
  it("sets read_at on the given notification", async () => {
    await markNotificationRead("n1");

    expect(updateMock).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(eqMock).toHaveBeenCalledWith("id", "n1");
  });
});

describe("markAllNotificationsRead", () => {
  // SPM-76 AC03: mark all notifications as read.
  it("sets read_at on every unread row", async () => {
    await markAllNotificationsRead();

    expect(updateMock).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(isMock).toHaveBeenCalledWith("read_at", null);
  });
});
