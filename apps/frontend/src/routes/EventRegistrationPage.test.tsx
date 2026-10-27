import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
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
vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
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
  loadEventDetailMock.mockReset().mockResolvedValue(baseEvent);
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
    loadEventDetailMock.mockResolvedValue({
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

  it("offers to withdraw only when the event permits it", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    loadEventDetailMock.mockResolvedValue({
      ...baseEvent,
      registration: { ...baseEvent.registration, withdrawalPermitted: true },
    });
    const user = userEvent.setup();
    renderPage();

    const withdrawButton = await screen.findByRole("button", { name: "Withdraw registration" });
    await user.click(withdrawButton);

    expect(withdrawRegistrationMock).toHaveBeenCalledWith("event-1");
    expect(await screen.findByRole("button", { name: "Register" })).toBeInTheDocument();
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
    loadEventDetailMock.mockResolvedValue({ ...baseEvent, status: "completed" });
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
    loadEventDetailMock.mockResolvedValue({ ...baseEvent, status: "cancelled" });
    renderPage();

    expect(await screen.findByText("This event was cancelled.")).toBeInTheDocument();
    expect(screen.queryByText(/You were registered/)).not.toBeInTheDocument();
  });

  it("tells a still-registered attendee they were registered once the event ends", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    loadEventDetailMock.mockResolvedValue({ ...baseEvent, status: "completed" });
    renderPage();

    expect(await screen.findByText(/You were registered\./)).toBeInTheDocument();
  });
});
