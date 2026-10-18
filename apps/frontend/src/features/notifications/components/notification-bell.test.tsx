import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listNotificationsMock = vi.fn();
const getUnreadNotificationCountMock = vi.fn();
const markNotificationReadMock = vi.fn();
const markAllNotificationsReadMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/features/notifications/services/notifications", () => ({
  listNotifications: () => listNotificationsMock(),
  getUnreadNotificationCount: () => getUnreadNotificationCountMock(),
  markNotificationRead: (...args: unknown[]) => markNotificationReadMock(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsReadMock(...args),
}));

vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { NotificationBell } from "./notification-bell";

const UNREAD = {
  id: "n1",
  type: "decision" as const,
  title: "Event approved",
  message: 'Your event "Alumni Homecoming Mixer" was approved.',
  eventId: "e1",
  readAt: null,
  createdAt: "2026-10-06T09:00:00Z",
};

const READ = {
  id: "n2",
  type: "assignment" as const,
  title: "New event request assigned to you",
  message: 'Event "Career Fair Showcase" has been assigned to you for review.',
  eventId: "e2",
  readAt: "2026-10-04T15:30:00Z",
  createdAt: "2026-10-04T15:00:00Z",
};

const VENUE_REQUEST_UNREAD = {
  id: "n3",
  type: "venue_request" as const,
  title: "New venue booking request",
  message: 'A new venue booking request for "Claude Seminar" at Pan Pacific Hotel is awaiting your review.',
  eventId: "e3",
  readAt: null,
  createdAt: "2026-10-06T19:15:00Z",
};

function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  markNotificationReadMock.mockResolvedValue(undefined);
  markAllNotificationsReadMock.mockResolvedValue(undefined);
});

describe("NotificationBell", () => {
  // SPM-76 AC02: an unread count badge is shown in the navigation.
  it("shows the unread count badge", async () => {
    listNotificationsMock.mockResolvedValue([UNREAD, READ]);
    getUnreadNotificationCountMock.mockResolvedValue(1);

    renderBell();

    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("shows no badge when there are no unread notifications", async () => {
    listNotificationsMock.mockResolvedValue([READ]);
    getUnreadNotificationCountMock.mockResolvedValue(0);

    renderBell();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument(),
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows the empty state only when there are truly no notifications", async () => {
    listNotificationsMock.mockResolvedValue([]);
    getUnreadNotificationCountMock.mockResolvedValue(0);
    const user = userEvent.setup();

    renderBell();
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("You're all caught up")).toBeInTheDocument();
  });

  it("keeps an all-read list visible instead of showing the empty state", async () => {
    listNotificationsMock.mockResolvedValue([READ]);
    getUnreadNotificationCountMock.mockResolvedValue(0);
    const user = userEvent.setup();

    renderBell();
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText(READ.title)).toBeInTheDocument();
    expect(screen.queryByText("You're all caught up")).not.toBeInTheDocument();
  });

  // SPM-76 AC03 + AC04: selecting one marks it read and opens its event.
  it("marks a notification read and navigates to its event on selection", async () => {
    listNotificationsMock.mockResolvedValue([UNREAD]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    );
    await user.click(await screen.findByText(UNREAD.title));

    expect(markNotificationReadMock).toHaveBeenCalledWith(UNREAD.id);
    expect(navigateMock).toHaveBeenCalledWith(`/events/${UNREAD.eventId}`);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument(),
    );
  });

  // Venue hold AC05: the reminder takes the coordinator to the event's venue
  // page, where the Confirm request option is.
  it("AC05 (venue hold): opens the event's venue page from a hold-expiring-soon reminder", async () => {
    const reminder = {
      id: "n4",
      type: "venue_hold_expiring_soon" as const,
      title: "Venue hold expires soon",
      message: 'Your tentative hold on Main Hall for "Career Fair" expires at 3:00 PM on 12 May. Confirm it to keep your place in the queue.',
      eventId: "e4",
      venueId: null,
      readAt: null,
      createdAt: "2026-10-06T09:00:00Z",
    };
    listNotificationsMock.mockResolvedValue([reminder]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(await screen.findByText("Venue hold expires soon"));

    expect(markNotificationReadMock).toHaveBeenCalledWith("n4");
    expect(navigateMock).toHaveBeenCalledWith("/events/e4/venue");
  });

  // SPM-76 AC03: a user can mark all notifications as read.
  // SPM-88: conflict notifications go to Venue Staff, so they open the Flagged page.
  it.each([
    ["venue_conflict_flagged" as const, "Venue booking conflict"],
    ["venue_conflict_resolved" as const, "Venue conflict cleared"],
  ])("SPM-88: opens the Flagged page from a %s notification", async (type, title) => {
    listNotificationsMock.mockResolvedValue([
      {
        id: "n5",
        type,
        title,
        message: '"Morning Talk" and "Afternoon Talk" now conflict once setup/turnaround time is applied.',
        eventId: "e5",
        venueId: null,
        readAt: null,
        createdAt: "2026-10-09T02:00:00Z",
      },
    ]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(await screen.findByText(title));

    expect(markNotificationReadMock).toHaveBeenCalledWith("n5");
    expect(navigateMock).toHaveBeenCalledWith("/flagged-bookings");
  });

  it("marks every unread notification read without navigating", async () => {
    listNotificationsMock.mockResolvedValue([UNREAD, READ]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    );
    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));

    expect(markAllNotificationsReadMock).toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Notifications" }),
      ).toBeInTheDocument(),
    );
  });

  it("routes a venue booking request notification to the requests list, not the event page", async () => {
    listNotificationsMock.mockResolvedValue([VENUE_REQUEST_UNREAD]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(
      await screen.findByRole("button", { name: "Notifications, 1 unread" }),
    );
    await user.click(await screen.findByText(VENUE_REQUEST_UNREAD.title));

    expect(markNotificationReadMock).toHaveBeenCalledWith(VENUE_REQUEST_UNREAD.id);
    expect(navigateMock).toHaveBeenCalledWith("/venue-requests");
    expect(navigateMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/events/"),
    );
  });

  // Feedback: a withdrawn or cancelled booking is logged on the venue's Activity section.
  it("routes a withdrawn or cancelled booking notification to that venue's Activity log", async () => {
    listNotificationsMock.mockResolvedValue([
      { ...VENUE_REQUEST_UNREAD, id: "n9", type: "venue_request_withdrawn" as const, title: "Venue booking cancelled", venueId: "venue-7" },
    ]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(await screen.findByText("Venue booking cancelled"));

    expect(navigateMock).toHaveBeenCalledWith("/venues/venue-7#activity");
  });

  it("falls back to the requests list when the venue is not known", async () => {
    listNotificationsMock.mockResolvedValue([
      { ...VENUE_REQUEST_UNREAD, id: "n10", type: "venue_request_withdrawn" as const, title: "Venue booking request withdrawn", venueId: null },
    ]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(await screen.findByText("Venue booking request withdrawn"));

    expect(navigateMock).toHaveBeenCalledWith("/venue-requests");
  });

  // SPM-82: a venue decision (including a rejected replacement) opens the change
  // history, where the outcome and the rejection reason are listed.
  it("routes a venue decision notification to the event's change history", async () => {
    listNotificationsMock.mockResolvedValue([
      { ...UNREAD, id: "n8", type: "venue_decision" as const, title: "Replacement venue rejected", eventId: "e8" },
    ]);
    getUnreadNotificationCountMock.mockResolvedValue(1);
    const user = userEvent.setup();

    renderBell();
    await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    await user.click(await screen.findByText("Replacement venue rejected"));

    expect(navigateMock).toHaveBeenCalledWith("/events/e8/history");
  });

  // SPM-83: a disruption notification goes to the venue page where the
  // coordinator arranges an alternative.
  it.each(["venue_booking_disrupted", "venue_disruption_cleared"] as const)(
    "routes a %s notification to the event's venue page",
    async (type) => {
      listNotificationsMock.mockResolvedValue([
        { ...UNREAD, id: "n9", type, title: "Venue issue", eventId: "e9" },
      ]);
      getUnreadNotificationCountMock.mockResolvedValue(1);
      const user = userEvent.setup();

      renderBell();
      await user.click(
        await screen.findByRole("button", { name: "Notifications, 1 unread" }),
      );
      await user.click(await screen.findByText("Venue issue"));

      expect(navigateMock).toHaveBeenCalledWith("/events/e9/venue");
    },
  );

  it("disables Mark all as read when nothing is unread", async () => {
    listNotificationsMock.mockResolvedValue([READ]);
    getUnreadNotificationCountMock.mockResolvedValue(0);
    const user = userEvent.setup();

    renderBell();
    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(
      await screen.findByRole("button", { name: "Mark all as read" }),
    ).toBeDisabled();
  });

  describe("SPM-76: notification centre", () => {
    // SPM-76 AC01: each notification shows its message and time, newest first.
    it("lists each notification with its title, message and time, newest first", async () => {
      listNotificationsMock.mockResolvedValue([UNREAD, READ]);
      getUnreadNotificationCountMock.mockResolvedValue(1);
      const user = userEvent.setup();

      renderBell();
      await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));

      const newer = (await screen.findByText(UNREAD.title)).closest("button")!;
      const older = screen.getByText(READ.title).closest("button")!;
      expect(newer).toHaveTextContent(UNREAD.message);
      expect(newer).toHaveTextContent(/6 Oct 2026, 5:00\spm/);
      expect(older).toHaveTextContent(READ.message);
      expect(older).toHaveTextContent(/4 Oct 2026, 11:00\spm/);
      expect(newer.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    // SPM-76 AC02: the badge count drops as a notification is read.
    it("lowers the unread badge by one when a notification is read", async () => {
      listNotificationsMock.mockResolvedValue([UNREAD, { ...UNREAD, id: "n5", title: "Second update" }]);
      getUnreadNotificationCountMock.mockResolvedValue(2);
      const user = userEvent.setup();

      renderBell();
      await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
      await user.click(await screen.findByText("Second update"));

      expect(await screen.findByRole("button", { name: "Notifications, 1 unread" })).toHaveTextContent("1");
      expect(markNotificationReadMock).toHaveBeenCalledWith("n5");
    });

    // SPM-76 AC02 + AC03: marking all as read clears the badge.
    it("clears the unread badge after marking all as read", async () => {
      listNotificationsMock.mockResolvedValue([UNREAD, { ...UNREAD, id: "n5", title: "Second update" }]);
      getUnreadNotificationCountMock.mockResolvedValue(2);
      const user = userEvent.setup();

      renderBell();
      await user.click(await screen.findByRole("button", { name: "Notifications, 2 unread" }));
      await user.click(await screen.findByRole("button", { name: "Mark all as read" }));

      const bell = await screen.findByRole("button", { name: "Notifications" });
      expect(bell).not.toHaveTextContent("2");
      expect(markAllNotificationsReadMock).toHaveBeenCalledTimes(1);
    });

    // SPM-76 AC02: a large count stays readable in the badge.
    it("caps the badge at 9+", async () => {
      listNotificationsMock.mockResolvedValue([UNREAD]);
      getUnreadNotificationCountMock.mockResolvedValue(12);

      renderBell();

      expect(await screen.findByRole("button", { name: "Notifications, 12 unread" })).toHaveTextContent("9+");
    });

    // SPM-76 AC03: reading an already-read notification does not write again.
    it("does not mark an already-read notification read again", async () => {
      listNotificationsMock.mockResolvedValue([READ]);
      getUnreadNotificationCountMock.mockResolvedValue(0);
      const user = userEvent.setup();

      renderBell();
      await user.click(screen.getByRole("button", { name: "Notifications" }));
      await user.click(await screen.findByText(READ.title));

      expect(markNotificationReadMock).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith(`/events/${READ.eventId}`);
    });

    // SPM-76 AC04: a notification with no related event has nowhere to open.
    it("does not open anything for a notification with no related event", async () => {
      listNotificationsMock.mockResolvedValue([{ ...UNREAD, eventId: null, title: "General notice" }]);
      getUnreadNotificationCountMock.mockResolvedValue(1);
      const user = userEvent.setup();

      renderBell();
      await user.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));

      expect((await screen.findByText("General notice")).closest("button")).toBeDisabled();
      expect(navigateMock).not.toHaveBeenCalled();
    });
  });
});
