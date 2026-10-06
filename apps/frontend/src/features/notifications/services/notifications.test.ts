import { beforeEach, describe, expect, it, vi } from "vitest";

const orderMock = vi.fn();
const limitMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const isMock = vi.fn();
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
  selectMock.mockReturnValue({ order: orderMock, head: undefined });
  eqMock.mockResolvedValue({ error: null });
  isMock.mockResolvedValue({ error: null });
  updateMock.mockReturnValue({ eq: eqMock, is: isMock });
  fromMock.mockReturnValue({ select: selectMock, update: updateMock });
});

describe("listNotifications", () => {
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
        },
      ],
      error: null,
    });

    const result = await listNotifications();

    expect(fromMock).toHaveBeenCalledWith("notifications");
    expect(orderMock).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limitMock).toHaveBeenCalledWith(20);
    expect(result).toEqual([
      {
        id: "n1",
        type: "decision",
        title: "Event approved",
        message: "Your event was approved.",
        eventId: "e1",
        readAt: null,
        createdAt: "2026-10-06T09:00:00Z",
      },
    ]);
  });

  it("throws a friendly error when the query fails", async () => {
    limitMock.mockResolvedValueOnce({ data: null, error: { message: "boom" } });

    await expect(listNotifications()).rejects.toThrow(
      "Your notifications are unavailable.",
    );
  });
});

describe("getUnreadNotificationCount", () => {
  it("filters to unread rows and returns the count", async () => {
    const headSelectMock = vi.fn().mockReturnValue({ is: isMock });
    fromMock.mockReturnValueOnce({ select: headSelectMock });
    isMock.mockResolvedValueOnce({ count: 3, error: null });

    const result = await getUnreadNotificationCount();

    expect(headSelectMock).toHaveBeenCalledWith("id", { count: "exact", head: true });
    expect(isMock).toHaveBeenCalledWith("read_at", null);
    expect(result).toBe(3);
  });
});

describe("markNotificationRead", () => {
  it("sets read_at on the given notification", async () => {
    await markNotificationRead("n1");

    expect(updateMock).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(eqMock).toHaveBeenCalledWith("id", "n1");
  });
});

describe("markAllNotificationsRead", () => {
  it("sets read_at on every unread row", async () => {
    await markAllNotificationsRead();

    expect(updateMock).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(isMock).toHaveBeenCalledWith("read_at", null);
  });
});
