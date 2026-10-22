import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const getOwnRegistrationStatusMock = vi.fn();
const getRegisteredCountMock = vi.fn();
const registerForEventMock = vi.fn();

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
  registerForEvent: (...args: unknown[]) => registerForEventMock(...args),
}));

import { EventRegistrationPage } from "./EventRegistrationPage";

const event = {
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
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  getRegisteredCountMock.mockReset().mockResolvedValue(32);
  getOwnRegistrationStatusMock.mockReset().mockResolvedValue(null);
  registerForEventMock.mockReset().mockResolvedValue({ data: { status: "registered" } });
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

  it("shows capacity-full messaging with no form when the event is full", async () => {
    getRegisteredCountMock.mockResolvedValue(50);
    renderPage();

    expect(await screen.findByText("This event has reached capacity.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
  });

  it("shows a confirmation, not the form, when the attendee already registered", async () => {
    getOwnRegistrationStatusMock.mockResolvedValue("registered");
    renderPage();

    expect(await screen.findByText("You're registered")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(registerForEventMock).not.toHaveBeenCalled();
  });
});
