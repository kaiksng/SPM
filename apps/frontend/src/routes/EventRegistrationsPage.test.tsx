import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  profile: { full_name: "Kai Test", role: "event_organiser" },
  user: { id: "organiser-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

const loadEventDetailMock = vi.fn();
vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

const listEventRegistrationsMock = vi.fn();
vi.mock("@/features/registrations/services/registrations", () => ({
  listEventRegistrations: (...args: unknown[]) => listEventRegistrationsMock(...args),
}));

import { EventRegistrationsPage } from "./EventRegistrationsPage";

const event = {
  id: "event-1",
  title: "Spring Expo",
  status: "confirmed",
  startsAt: "2099-07-01T01:00:00.000Z",
  endsAt: "2099-07-01T06:00:00.000Z",
  assignedCoordinatorId: "coordinator-1",
  venue: { preferredLocation: "Auditorium" },
  registration: { capacity: 4 },
};

const entry = (overrides: Record<string, unknown>) => ({
  id: "reg-1",
  attendeeId: "attendee-1",
  attendeeName: "Avery Attendee",
  status: "registered",
  registeredAt: "2099-06-01T00:00:00.000Z",
  withdrawnAt: null,
  waitlistPosition: null,
  ...overrides,
});

// RoleGate's Lead allow-list matches on a UUID-shaped segment, so the route
// param has to look like one even though the mocked services ignore it.
const EVENT_ID = "10000000-0000-0000-0000-000000000099";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/events/${EVENT_ID}/registrations`]}>
      <Routes>
        <Route path="events/:eventId/registrations" element={<EventRegistrationsPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  authState.profile = { full_name: "Kai Test", role: "event_organiser" };
  authState.user = { id: "organiser-1" };
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  listEventRegistrationsMock.mockReset().mockResolvedValue([
    entry({ id: "reg-1", attendeeName: "Avery Attendee", status: "registered" }),
    entry({
      id: "reg-2",
      attendeeId: "attendee-2",
      attendeeName: "Blair Attendee",
      status: "waitlisted",
      waitlistPosition: 1,
    }),
    entry({
      id: "reg-3",
      attendeeId: "attendee-3",
      attendeeName: "Cass Attendee",
      status: "withdrawn",
      withdrawnAt: "2099-06-10T00:00:00.000Z",
    }),
  ]);
});

describe("EventRegistrationsPage", () => {
  // SPM-44 AC03: capacity and counts for Registered, Waitlisted and Withdrawn.
  it("shows capacity and counts by status", async () => {
    renderPage();

    expect(await screen.findByText("Spring Expo")).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && el.textContent === "1 of 4 places filled"),
    ).toBeInTheDocument();
    expect(screen.getByText("Registered (1)")).toBeInTheDocument();
    expect(screen.getByText("Waitlisted (1)")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn (1)")).toBeInTheDocument();
  });

  // SPM-44 AC04: attendee name, status and waiting-list position.
  it("lists each attendee's name, status, registered time and waiting-list position", async () => {
    renderPage();

    const row = (await screen.findByText("Avery Attendee")).closest("tr")!;
    expect(within(row).getByText("Registered")).toBeInTheDocument();
    expect(within(row).getByText("—")).toBeInTheDocument();

    const waitlistedRow = screen.getByText("Blair Attendee").closest("tr")!;
    expect(within(waitlistedRow).getByText("Waitlisted")).toBeInTheDocument();
    expect(within(waitlistedRow).getByText("1")).toBeInTheDocument();
  });

  it("filters the table by status", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Avery Attendee");
    await user.click(screen.getByRole("button", { name: "Waitlisted (1)" }));

    expect(screen.queryByText("Avery Attendee")).not.toBeInTheDocument();
    expect(screen.getByText("Blair Attendee")).toBeInTheDocument();
  });

  // SPM-44 AC05: no equipment or internal venue details on this view.
  it("queries registrations on their own, never the equipment or venue-detail loaders", async () => {
    renderPage();

    await screen.findByText("Spring Expo");
    // Only the booked location (part of the event's own schedule line) shows;
    // no equipment list and no internal venue-management detail is fetched
    // or rendered — this page's own query (listEventRegistrations) carries
    // none of that, unlike loadEventDetail's full record.
    expect(listEventRegistrationsMock).toHaveBeenCalledWith(EVENT_ID);
    expect(screen.queryByText(/Projector|Microphone|Accessibility|Layout/)).not.toBeInTheDocument();
  });

  it("shows an error state when the event or registrations can't load", async () => {
    loadEventDetailMock.mockRejectedValue(new Error("We couldn't load this event."));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load this event.");
  });

  // SPM-44 AC02: coordinators see only their assigned events.
  it("blocks a coordinator who isn't assigned to this event", async () => {
    authState.profile = { full_name: "Other Coordinator", role: "event_coordinator" };
    authState.user = { id: "coordinator-2" };
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event is unavailable or you do not have access to it.",
    );
  });

  // SPM-44 AC02: the assigned coordinator can view it.
  it("allows the assigned coordinator through", async () => {
    authState.profile = { full_name: "Joyce Coordinator", role: "event_coordinator" };
    authState.user = { id: "coordinator-1" };
    renderPage();

    expect(await screen.findByText("Avery Attendee")).toBeInTheDocument();
  });

  // SPM-44 AC02: the Event Coordinator Lead sees all events.
  it("allows the Event Coordinator Lead through for any event", async () => {
    authState.profile = { full_name: "Lee Lead", role: "event_coordinator_lead" };
    authState.user = { id: "lead-1" };
    renderPage();

    expect(await screen.findByText("Avery Attendee")).toBeInTheDocument();
  });
});

describe("SPM-44: viewing registration information", () => {
  // SPM-44 AC01: the organiser can view registrations for their own event.
  it("shows the organiser the registrations for their own event", async () => {
    renderPage();

    expect(await screen.findByText("Avery Attendee")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  // SPM-44 AC01: another organiser's event is hidden by the database, so the
  // load fails and no attendee is shown.
  it("denies an organiser the registrations for someone else's event", async () => {
    loadEventDetailMock.mockRejectedValue(
      new Error("This event is unavailable or you do not have access to it."),
    );
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This event is unavailable or you do not have access to it.",
    );
    expect(screen.queryByText("Avery Attendee")).not.toBeInTheDocument();
    expect(screen.queryByText(/places filled/)).not.toBeInTheDocument();
  });

  // SPM-44 AC02: an unassigned coordinator sees no attendee details.
  it("shows an unassigned coordinator no attendee details", async () => {
    authState.profile = { full_name: "Other Coordinator", role: "event_coordinator" };
    authState.user = { id: "coordinator-2" };
    renderPage();

    await screen.findByRole("alert");
    expect(screen.queryByText("Avery Attendee")).not.toBeInTheDocument();
    expect(screen.queryByText("Registered (1)")).not.toBeInTheDocument();
  });

  // SPM-44 AC04: each attendee's registration time is shown.
  it("shows when each attendee registered", async () => {
    renderPage();

    const row = (await screen.findByText("Avery Attendee")).closest("tr")!;
    expect(row).toHaveTextContent(/1 Jun 2099, 8:00\sam/);
  });

  // SPM-44 AC04: waiting-list positions run in registration order.
  it("numbers several waitlisted attendees in the order they joined", async () => {
    listEventRegistrationsMock.mockResolvedValue([
      entry({ id: "reg-1", attendeeName: "First Waiter", status: "waitlisted", waitlistPosition: 1 }),
      entry({ id: "reg-2", attendeeId: "attendee-2", attendeeName: "Second Waiter", status: "waitlisted", waitlistPosition: 2 }),
    ]);
    renderPage();

    expect(within((await screen.findByText("First Waiter")).closest("tr")!).getByText("1")).toBeInTheDocument();
    expect(within(screen.getByText("Second Waiter").closest("tr")!).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Waitlisted (2)")).toBeInTheDocument();
  });

  // SPM-44 AC03: with no attendees, every count is zero against the capacity.
  it("shows zero counts when nobody has registered", async () => {
    listEventRegistrationsMock.mockResolvedValue([]);
    renderPage();

    expect(
      await screen.findByText((_, el) => el?.tagName === "P" && el.textContent === "0 of 4 places filled"),
    ).toBeInTheDocument();
    expect(screen.getByText("Registered (0)")).toBeInTheDocument();
    expect(screen.getByText("Waitlisted (0)")).toBeInTheDocument();
    expect(screen.getByText("Withdrawn (0)")).toBeInTheDocument();
  });

  // SPM-44 AC05: no internal venue or equipment details appear, even if the
  // event record carries them.
  it("shows no equipment or internal venue notes from the event record", async () => {
    loadEventDetailMock.mockResolvedValue({
      ...event,
      venue: { preferredLocation: "Auditorium", accessibilityNotes: "Ramp at the side entrance", layoutNotes: "Theatre", facilities: ["Projector screen"] },
      equipment: [{ id: "req-1", equipmentName: "Wireless microphone", quantity: 4 }],
    });
    renderPage();

    expect(await screen.findByText("Avery Attendee")).toBeInTheDocument();
    for (const internal of ["Ramp at the side entrance", "Theatre", "Projector screen", /Wireless microphone/]) {
      expect(screen.queryByText(internal)).not.toBeInTheDocument();
    }
  });
});
