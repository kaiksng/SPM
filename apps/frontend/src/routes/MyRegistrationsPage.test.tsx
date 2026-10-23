import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listMyRegistrationsMock = vi.fn();
const leaveWaitlistMock = vi.fn();

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
  registeredAt: "2026-11-01T00:00:00Z",
  waitlistPosition: null,
};

describe("MyRegistrationsPage", () => {
  beforeEach(() => {
    listMyRegistrationsMock.mockReset().mockResolvedValue([]);
    leaveWaitlistMock.mockReset().mockResolvedValue({ data: null });
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
});
