import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMyRegistrationsMock = vi.fn();
const leaveWaitlistMock = vi.fn();
const withdrawRegistrationMock = vi.fn();

const authState = {
  profile: { full_name: "Priya Tan", role: "attendee" },
  user: { id: "attendee-1" },
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/features/registrations/services/registrations", () => ({
  listMyRegistrations: (...args: unknown[]) => listMyRegistrationsMock(...args),
  leaveWaitlist: (...args: unknown[]) => leaveWaitlistMock(...args),
  withdrawRegistration: (...args: unknown[]) => withdrawRegistrationMock(...args),
}));

import { MyRegistrationsPage } from "./MyRegistrationsPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/browse-events/my-registrations"]}>
      <MyRegistrationsPage />
    </MemoryRouter>,
  );
}

const registration = {
  id: "reg-1",
  eventId: "event-1",
  title: "Robotics Showcase",
  startsAt: "2026-11-28T03:00:00Z",
  endsAt: "2026-11-28T07:00:00Z",
  location: "Exhibition Hall",
  status: "registered",
  statusBeforeCancellation: null as string | null,
  registeredAt: "2026-11-01T00:00:00Z",
  waitlistPosition: null,
  withdrawalPermitted: false,
};

describe("MyRegistrationsPage", () => {
  beforeEach(() => {
    listMyRegistrationsMock.mockReset().mockResolvedValue([]);
    leaveWaitlistMock.mockReset().mockResolvedValue({ data: null });
    withdrawRegistrationMock.mockReset().mockResolvedValue({ data: null });
  });

  it("shows an empty state when the attendee has no registrations", async () => {
    renderPage();

    expect(await screen.findByText("No registrations yet")).toBeInTheDocument();
  });

  it("lists the attendee's registrations", async () => {
    listMyRegistrationsMock.mockResolvedValue([registration]);

    renderPage();

    const card = (await screen.findByText("Robotics Showcase")).closest("article")!;
    expect(within(card).getByText("Exhibition Hall")).toBeInTheDocument();
    expect(within(card).getByText("Registered")).toBeInTheDocument();
  });

  // 202611010007: a cancelled event stays listed, clearly marked, with no actions.
  it.each([
    ["registered", "This event was cancelled. Your place has been released."],
    ["waitlisted", "This event was cancelled. You've been taken off the waiting list."],
  ])("shows an event cancelled while the attendee was %s, with no actions", async (before, message) => {
    listMyRegistrationsMock.mockResolvedValue([
      { ...registration, status: "event_cancelled", statusBeforeCancellation: before, withdrawalPermitted: true },
    ]);

    renderPage();

    const card = (await screen.findByText("Robotics Showcase")).closest("article")!;
    expect(within(card).getByText("Event cancelled")).toBeInTheDocument();
    expect(within(card).getByText(message)).toBeInTheDocument();
    expect(within(card).queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows an error message when the registrations fail to load", async () => {
    listMyRegistrationsMock.mockRejectedValue(new Error("We couldn't load your registrations."));

    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't load your registrations.");
  });

  it("shows the waiting-list position and a label of 'Waiting list', not 'Waitlisted'", async () => {
    listMyRegistrationsMock.mockResolvedValue([
      { ...registration, status: "waitlisted", waitlistPosition: 4 },
    ]);

    renderPage();

    const card = (await screen.findByText("Robotics Showcase")).closest("article")!;
    expect(within(card).getByText("Position 4")).toBeInTheDocument();
    expect(within(card).getByText("Waiting list")).toBeInTheDocument();
    expect(within(card).queryByText("Waitlisted")).not.toBeInTheDocument();
  });

  it("lets the attendee leave the waiting list", async () => {
    listMyRegistrationsMock.mockResolvedValue([
      { ...registration, status: "waitlisted", waitlistPosition: 4 },
    ]);
    const user = userEvent.setup();

    renderPage();

    await screen.findByText("Robotics Showcase");
    await user.click(screen.getByRole("button", { name: "Leave waiting list" }));

    expect(leaveWaitlistMock).toHaveBeenCalledWith("event-1");
    expect(await screen.findByText("No registrations yet")).toBeInTheDocument();
  });

  // SPM-43 scenario 2: Withdraw is reachable from My Registrations, not just
  // the single-event page, and only when the organiser permits it.
  // UI: the status sits beside the title, so the right of the card holds only
  // the action (Withdraw), not a status pill stacked above it.
  it("shows the status beside the title and Withdraw on its own", async () => {
    listMyRegistrationsMock.mockResolvedValue([{ ...registration, withdrawalPermitted: true }]);
    renderPage();

    const title = await screen.findByRole("link", { name: registration.title });
    expect(title.parentElement).toHaveTextContent("Registered");
    const withdraw = screen.getByRole("button", { name: "Withdraw" });
    expect(withdraw.parentElement).not.toHaveTextContent("Registered");
  });

  it("notes that an event being updated keeps the attendee's place", async () => {
    listMyRegistrationsMock.mockResolvedValue([{ ...registration, eventBeingUpdated: true }]);
    renderPage();

    expect(await screen.findByText(/Venue to be confirmed.*Your place is kept/)).toBeInTheDocument();
  });

  it("hides the withdraw action when the event does not permit it", async () => {
    listMyRegistrationsMock.mockResolvedValue([registration]);
    renderPage();

    await screen.findByText("Robotics Showcase");
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
  });

  // SPM-43 AC01 + AC02: the registration becomes Withdrawn, with confirmation.
  it("lets the attendee withdraw a registered registration, with an optional reason", async () => {
    listMyRegistrationsMock.mockResolvedValue([{ ...registration, withdrawalPermitted: true }]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Reason/), "Schedule conflict.");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(withdrawRegistrationMock).toHaveBeenCalledWith("event-1", "Schedule conflict.");
    expect(
      await screen.findByText("You've withdrawn — your place has been released."),
    ).toBeInTheDocument();
    const card = (await screen.findByText("Robotics Showcase")).closest("article")!;
    expect(within(card).getByText("Withdrawn")).toBeInTheDocument();
  });
});

describe("SPM-43: a withdrawal that is refused", () => {
  beforeEach(() => {
    listMyRegistrationsMock.mockReset().mockResolvedValue([{ ...registration, withdrawalPermitted: true }]);
    withdrawRegistrationMock.mockReset();
  });

  // SPM-43 scenario 2: a rejected withdrawal leaves the registration as it was.
  it("keeps the registration Registered and explains why", async () => {
    withdrawRegistrationMock.mockRejectedValue(new Error("Withdrawal is not permitted for this event."));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Withdraw" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(await within(dialog).findByText("Withdrawal is not permitted for this event.")).toBeInTheDocument();
    const card = screen.getByText("Robotics Showcase").closest("article")!;
    expect(within(card).queryByText("Withdrawn")).not.toBeInTheDocument();
    expect(screen.queryByText(/your place has been released/)).not.toBeInTheDocument();
  });
});
