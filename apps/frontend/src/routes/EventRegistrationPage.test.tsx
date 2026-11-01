import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const loadAttendeeEventDetailMock = vi.fn();
const getOwnRegistrationStatusMock = vi.fn();
const getRegisteredCountMock = vi.fn();
const getWaitlistPositionMock = vi.fn();
const registerForEventMock = vi.fn();
const joinWaitlistMock = vi.fn();
const leaveWaitlistMock = vi.fn();
const withdrawRegistrationMock = vi.fn();

const authState = {
  profile: { full_name: "Priya Tan", role: "attendee" },
  user: { id: "attendee-1", email: "priya.tan@school.edu" },
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/features/event-banners/services/event-banners", () => ({
  eventBannerUrl: (path: string | null) => (path ? `https://storage.test/${path}` : null),
  uploadEventBanner: vi.fn(),
  removeEventBanner: vi.fn(),
}));
vi.mock("@/features/registrations/services/attendee-event", () => ({
  loadAttendeeEventDetail: (...args: unknown[]) => loadAttendeeEventDetailMock(...args),
}));
vi.mock("@/features/registrations/services/registrations", () => ({
  getOwnRegistrationStatus: (...args: unknown[]) => getOwnRegistrationStatusMock(...args),
  getRegisteredCount: (...args: unknown[]) => getRegisteredCountMock(...args),
  getWaitlistPosition: (...args: unknown[]) => getWaitlistPositionMock(...args),
  registerForEvent: (...args: unknown[]) => registerForEventMock(...args),
  joinWaitlist: (...args: unknown[]) => joinWaitlistMock(...args),
  leaveWaitlist: (...args: unknown[]) => leaveWaitlistMock(...args),
  withdrawRegistration: (...args: unknown[]) => withdrawRegistrationMock(...args),
}));

import { EventRegistrationPage } from "./EventRegistrationPage";

const baseEvent = {
  id: "event-1",
  title: "AI Innovation Summit",
  purpose: null,
  description: "A full day of talks and workshops on applied AI.",
  eventType: null,
  expectedAttendance: null,
  startsAt: "2026-11-12T02:00:00Z",
  endsAt: "2026-11-12T08:00:00Z",
  status: "confirmed",
  submittedAt: null,
  organiserId: "org-1",
  organiserName: "Student Life Office",
  bannerPath: null as string | null,
  assignedCoordinatorId: null,
  assignedCoordinatorName: null,
  venue: { preferredLocation: "Auditorium", minimumCapacity: null, accessibilityNotes: null, layoutNotes: null, facilities: [] },
  equipment: [],
  registration: {
    required: true,
    opensAt: null,
    closesAt: null,
    capacity: 50,
    waitlistEnabled: false,
    withdrawalPermitted: false,
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/browse-events/event-1"]}>
      <Routes>
        <Route path="browse-events/:eventId" element={<EventRegistrationPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadAttendeeEventDetailMock.mockReset().mockResolvedValue(baseEvent);
  getRegisteredCountMock.mockReset().mockResolvedValue(32);
  getOwnRegistrationStatusMock.mockReset().mockResolvedValue(null);
  getWaitlistPositionMock.mockReset().mockResolvedValue(null);
  registerForEventMock.mockReset().mockResolvedValue({ data: { status: "registered" } });
  joinWaitlistMock.mockReset().mockResolvedValue({ data: { status: "waitlisted" } });
  leaveWaitlistMock.mockReset().mockResolvedValue({ data: null });
  withdrawRegistrationMock.mockReset().mockResolvedValue({ data: null });
});

describe("EventRegistrationPage", () => {
  it("shows the attendee's own name and email, read-only, when registration is open", async () => {
    renderPage();

    expect(await screen.findByText("AI Innovation Summit")).toBeInTheDocument();
    expect(screen.getByText("Priya Tan")).toBeInTheDocument();
    expect(screen.getByText("priya.tan@school.edu")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("registers the attendee and shows confirmation", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Register" }));

    expect(registerForEventMock).toHaveBeenCalledWith("event-1");
    expect(await screen.findByText("You're registered")).toBeInTheDocument();
  });

  it("shows an error and stays on the form if registration fails", async () => {
    registerForEventMock.mockRejectedValue(new Error("This event has reached capacity"));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Register" }));

    expect(await screen.findByText("This event has reached capacity")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  it("shows capacity-full messaging with no waitlist option when the event is full and has none", async () => {
    getRegisteredCountMock.mockResolvedValue(50);
    renderPage();

    expect(await screen.findByText("This event has reached capacity.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join waiting list" })).not.toBeInTheDocument();
  });

  it("offers to join the waiting list when the event is full and waitlisting is enabled", async () => {
    getRegisteredCountMock.mockResolvedValue(50);
    loadAttendeeEventDetailMock.mockResolvedValue({
      ...baseEvent,
      registration: { ...baseEvent.registration, waitlistEnabled: true },
    });
    const user = userEvent.setup();
    renderPage();

    const joinButton = await screen.findByRole("button", { name: "Join waiting list" });
    await user.click(joinButton);

    expect(joinWaitlistMock).toHaveBeenCalledWith("event-1");
    expect(await screen.findByText(/You're on the waiting list/)).toBeInTheDocument();
  });

  it("shows a confirmation, not the form, when the attendee already registered", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    renderPage();

    expect(await screen.findByText("You're registered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(registerForEventMock).not.toHaveBeenCalled();
  });

  // SPM-43 scenario 2: when the organiser does not permit withdrawal, the action is unavailable.
  it("hides the withdraw action when the event does not permit it", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    renderPage();

    expect(await screen.findByText("You're registered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw registration" })).not.toBeInTheDocument();
  });

  // SPM-43 AC01 + AC02: the reason is optional, and a successful withdrawal is confirmed explicitly.
  it("withdraws with an optional reason, confirms, and releases the place", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    loadAttendeeEventDetailMock.mockResolvedValue({
      ...baseEvent,
      registration: { ...baseEvent.registration, withdrawalPermitted: true },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw registration" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Reason/), "Can no longer attend.");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(withdrawRegistrationMock).toHaveBeenCalledWith("event-1", "Can no longer attend.");
    expect(
      await screen.findByText("You've withdrawn — your place has been released."),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  // SPM-43 AC01: the withdrawal reason is optional.
  it("withdraws with no reason given", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    loadAttendeeEventDetailMock.mockResolvedValue({
      ...baseEvent,
      registration: { ...baseEvent.registration, withdrawalPermitted: true },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw registration" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(withdrawRegistrationMock).toHaveBeenCalledWith("event-1", "");
  });

  it("shows the waiting-list position and lets the attendee leave", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("waitlisted");
    getWaitlistPositionMock.mockResolvedValue(4);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/position 4/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leave waiting list" }));

    expect(leaveWaitlistMock).toHaveBeenCalledWith("event-1");
    expect(await screen.findByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  // can_view_event now also lets an attendee view an event they're (or
  // were) registered for after it leaves 'confirmed', so this page has to
  // stop offering live actions and show its real status once that happens.
  it("shows the event's real status and no actions once it has ended", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue(null);
    loadAttendeeEventDetailMock.mockResolvedValue({ ...baseEvent, status: "completed" });
    renderPage();

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.queryByText("Confirmed")).not.toBeInTheDocument();
    expect(screen.getByText("This event has ended.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  it("shows the attendee was cancelled on, with no mention of registration if they'd withdrawn", async () => {
    // getOwnRegistrationStatus already treats a withdrawn row as null, so an
    // attendee who withdrew before the event was cancelled sees no "you
    // were registered" note — only someone who never acted and was still
    // registered/waitlisted when it ended should see that.
    getOwnRegistrationStatusMock.mockResolvedValue(null);
    loadAttendeeEventDetailMock.mockResolvedValue({ ...baseEvent, status: "cancelled" });
    renderPage();

    expect(await screen.findByRole("heading", { name: "This event was cancelled" })).toBeInTheDocument();
    expect(screen.getByText("It will not go ahead.")).toBeInTheDocument();
    expect(screen.getByText("Registration is closed because the event was cancelled.")).toBeInTheDocument();
    expect(screen.queryByText(/You were registered/)).not.toBeInTheDocument();
  });

  // 202611010007: the registration became "Event cancelled"; the page is
  // told what it was, and says so in a banner at the top.
  it.each([
    ["registered" as const, "You were registered. Your place has been released."],
    ["waitlisted" as const, "You were on the waiting list and have been taken off it."],
  ])("tells an attendee who was %s that the event was cancelled, with no actions", async (status, message) => {
    getOwnRegistrationStatusMock.mockResolvedValue(status);
    loadAttendeeEventDetailMock.mockResolvedValue({ ...baseEvent, status: "cancelled" });
    renderPage();

    expect(await screen.findByRole("heading", { name: "This event was cancelled" })).toBeInTheDocument();
    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register|Withdraw|Join|Leave/ })).not.toBeInTheDocument();
  });

  it("tells a still-registered attendee they were registered once the event ends", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    loadAttendeeEventDetailMock.mockResolvedValue({ ...baseEvent, status: "completed" });
    renderPage();

    expect(await screen.findByText(/You were registered\./)).toBeInTheDocument();
  });
});

// SPM-41 (register for a Confirmed event) and SPM-42 (waiting list), with a
// real registration window. Only Date is faked, so findBy… still polls.
describe("EventRegistrationPage registration window", () => {
  const sgt = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" });
  const period = { opensAt: "2026-10-01T01:00:00Z", closesAt: "2026-11-30T10:00:00Z" };

  function withRegistration(registration: { opensAt?: string; closesAt?: string; waitlistEnabled?: boolean }) {
    loadAttendeeEventDetailMock.mockResolvedValue({
      ...baseEvent,
      registration: { ...baseEvent.registration, ...period, ...registration },
    });
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T02:00:00Z"));
    withRegistration({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // SPM-41 AC01: before registering, the confirmed details, remaining places and registration period are shown.
  it("shows the event's details, remaining places and registration period before registering", async () => {
    renderPage();

    expect(await screen.findByText("AI Innovation Summit")).toBeInTheDocument();
    expect(
      screen.getByText(`${sgt.format(new Date(baseEvent.startsAt))} – ${sgt.format(new Date(baseEvent.endsAt))}`),
    ).toBeInTheDocument();
    expect(screen.getByText("Auditorium")).toBeInTheDocument();
    expect(screen.getByText("A full day of talks and workshops on applied AI.")).toBeInTheDocument();
    expect(screen.getByText("18 of 50 spots left")).toBeInTheDocument();
    expect(
      screen.getByText(
        `Registration period: ${sgt.format(new Date(period.opensAt))} – ${sgt.format(new Date(period.closesAt))}`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Register" })).toBeInTheDocument();
  });

  // SPM-41 AC02: registering confirms it and the registered count rises by one.
  it("lowers the places left by one after registering", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("18 of 50 spots left")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("Added to your registrations.")).toBeInTheDocument();
    expect(screen.getByText("17 of 50 spots left")).toBeInTheDocument();
  });

  // SPM-41 AC03: before registration opens, the attendee cannot register and the count is unchanged.
  it("offers no Register before registration opens", async () => {
    withRegistration({ opensAt: "2026-12-01T01:00:00Z", closesAt: "2026-12-20T10:00:00Z" });
    renderPage();

    expect(
      await screen.findByText(`Registration opens ${sgt.format(new Date("2026-12-01T01:00:00Z"))}. Check back then.`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(screen.getByText("18 of 50 spots left")).toBeInTheDocument();
  });

  // SPM-41 AC03: after registration closes, the attendee cannot register and the count is unchanged.
  it("offers no Register after registration closes", async () => {
    withRegistration({ opensAt: "2026-09-01T01:00:00Z", closesAt: "2026-10-10T10:00:00Z" });
    renderPage();

    expect(await screen.findByText("Registration for this event is closed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(screen.getByText("18 of 50 spots left")).toBeInTheDocument();
    expect(registerForEventMock).not.toHaveBeenCalled();
  });

  // SPM-42 AC01: the waiting-list option appears only while registration is open.
  it.each([
    ["closed", { opensAt: "2026-09-01T01:00:00Z", closesAt: "2026-10-10T10:00:00Z" }, "Registration for this event is closed."],
    ["not yet open", { opensAt: "2026-12-01T01:00:00Z", closesAt: "2026-12-20T10:00:00Z" }, /Registration opens/],
  ])("offers no waiting list on a full event whose registration is %s", async (_label, dates, message) => {
    getRegisteredCountMock.mockResolvedValue(50);
    withRegistration({ ...dates, waitlistEnabled: true });
    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join waiting list" })).not.toBeInTheDocument();
    expect(screen.getByText("0 of 50 spots left")).toBeInTheDocument();
  });

  // SPM-42 AC02: an attendee already Registered or already waiting cannot join the waiting list.
  it.each([
    ["registered", "You're registered"],
    ["waitlisted", /You're on the waiting list/],
  ] as const)("offers no waiting list to an attendee who is already %s", async (status, message) => {
    getRegisteredCountMock.mockResolvedValue(50);
    getOwnRegistrationStatusMock.mockResolvedValue(status);
    getWaitlistPositionMock.mockResolvedValue(status === "waitlisted" ? 1 : null);
    withRegistration({ waitlistEnabled: true });
    renderPage();

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Join waiting list" })).not.toBeInTheDocument();
    expect(joinWaitlistMock).not.toHaveBeenCalled();
  });
});

describe("SPM-43: withdrawing a registration", () => {
  const permitted = {
    ...baseEvent,
    registration: { ...baseEvent.registration, withdrawalPermitted: true },
  };

  beforeEach(() => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    loadAttendeeEventDetailMock.mockResolvedValue(permitted);
  });

  // SPM-43 scenario 1: the attendee count decreases, so one more place is left.
  it("frees a place in the capacity count after withdrawing", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("18 of 50 spots left")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Withdraw registration" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw" }));

    expect(await screen.findByText("19 of 50 spots left")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "You've withdrawn — your place has been released.",
    );
  });

  // SPM-43 scenario 2: a withdrawal the server rejects changes nothing.
  it("keeps the registration when the withdrawal is rejected", async () => {
    withdrawRegistrationMock.mockRejectedValue(new Error("Withdrawal is not permitted for this event."));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw registration" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw" }));

    expect(
      await within(screen.getByRole("dialog")).findByText("Withdrawal is not permitted for this event."),
    ).toBeInTheDocument();
    expect(screen.getByText("You're registered")).toBeInTheDocument();
    expect(screen.getByText("18 of 50 spots left")).toBeInTheDocument();
    expect(screen.queryByText(/your place has been released/)).not.toBeInTheDocument();
  });

  // SPM-43 scenario 3: with capacity left and registration open, a withdrawn
  // attendee registering again is sent as a brand-new registration.
  it("lets a withdrawn attendee register again as a new registration", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw registration" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Withdraw" }));
    await user.click(await screen.findByRole("button", { name: "Register" }));

    expect(registerForEventMock).toHaveBeenCalledWith("event-1");
    expect(await screen.findByText("You're registered")).toBeInTheDocument();
    expect(screen.getByText("18 of 50 spots left")).toBeInTheDocument();
  });

  // SPM-43 scenario 3: a returning attendee is evaluated like anyone else, so
  // a full event offers the waiting list rather than a place.
  it("treats a previously withdrawn attendee like a new one when the event is full", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue(null);
    getRegisteredCountMock.mockResolvedValue(50);
    loadAttendeeEventDetailMock.mockResolvedValue({
      ...permitted,
      registration: { ...permitted.registration, waitlistEnabled: true },
    });
    renderPage();

    expect(await screen.findByRole("button", { name: "Join waiting list" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });
});

// SPM-44 AC05: the attendee-facing page loads the event through its own
// attendee loader (see attendee-event.test.ts, which checks it never asks for
// internal fields), and shows nothing internal even if a record carried it.
describe("SPM-44: attendee-facing registration view", () => {
  it("loads the event through the attendee loader and the counts function only", async () => {
    renderPage();

    expect(await screen.findByText("AI Innovation Summit")).toBeInTheDocument();
    expect(loadAttendeeEventDetailMock).toHaveBeenCalledWith("event-1");
    expect(getRegisteredCountMock).toHaveBeenCalledWith("event-1");
    expect(getWaitlistPositionMock).toHaveBeenCalledWith("event-1");
  });

  it("shows no internal venue, equipment or coordinator details", async () => {
    loadAttendeeEventDetailMock.mockResolvedValue({
      ...baseEvent,
      purpose: "Internal planning purpose",
      expectedAttendance: 180,
      assignedCoordinatorId: "coord-1",
      assignedCoordinatorName: "Joyce Coordinator",
      venue: {
        preferredLocation: "Auditorium",
        minimumCapacity: 150,
        accessibilityNotes: "Ramp at the side entrance",
        layoutNotes: "Theatre",
        facilities: ["Projector screen"],
      },
      equipment: [
        {
          id: "req-1",
          equipmentItemId: "item-1",
          equipmentName: "Wireless microphone",
          category: "Audio",
          quantity: 4,
          requiredFrom: "2026-11-12T01:00:00Z",
          requiredUntil: "2026-11-12T08:00:00Z",
          technicalRequirements: "Backup batteries",
        },
      ],
    });
    renderPage();

    expect(await screen.findByText("AI Innovation Summit")).toBeInTheDocument();
    expect(screen.getByText("Auditorium")).toBeInTheDocument();
    for (const internal of [
      "Internal planning purpose",
      "Joyce Coordinator",
      "Ramp at the side entrance",
      "Theatre",
      "Projector screen",
      /Wireless microphone/,
      /Backup batteries/,
      /180/,
    ]) {
      expect(screen.queryByText(internal)).not.toBeInTheDocument();
    }
  });
});

// Event banner: the organiser's banner sits behind the event's title.
describe("EventRegistrationPage banner", () => {
  it("shows the organiser's banner behind the title", async () => {
    loadAttendeeEventDetailMock.mockResolvedValue({ ...baseEvent, bannerPath: "org-1/summit.png" });
    renderPage();

    const heading = await screen.findByRole("heading", { name: "AI Innovation Summit" });
    expect(heading.parentElement!.style.backgroundImage).toContain("https://storage.test/org-1/summit.png");
  });

  it("keeps the plain header when the event has no banner", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", { name: "AI Innovation Summit" });
    expect(heading.parentElement!.style.backgroundImage).toBe("");
  });
});

// An event that doesn't take registrations says so, with nothing to register.
describe("EventRegistrationPage without registration", () => {
  it("says no registration is needed and offers no Register button", async () => {
    loadAttendeeEventDetailMock.mockResolvedValue({
      ...baseEvent,
      registration: { ...baseEvent.registration, required: false },
    });
    renderPage();

    expect(await screen.findByText("No registration needed for this event. Just come along.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(screen.queryByText(/spots left|of 50/)).not.toBeInTheDocument();
  });
});
