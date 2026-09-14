import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const listClarificationsMock = vi.fn();
const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "20000000-0000-0000-0000-000000000002" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({
  useAuth: () => authState,
}));

vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

vi.mock("@/features/event-requests/services/clarifications", () => ({
  listClarifications: (...args: unknown[]) => listClarificationsMock(...args),
  requestClarification: vi.fn(),
  respondToClarification: vi.fn(),
}));

vi.mock("@/features/event-requests/services/decisions", () => ({
  decideEvent: vi.fn(),
}));

vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

import { EventDetailPage } from "./EventDetailPage";

const event = {
  id: "event-1",
  title: "Student Leadership Summit 2",
  purpose: "All university student leaders workshop",
  description: "A full day of workshops for student leaders.",
  eventType: "Workshop",
  expectedAttendance: 120,
  startsAt: "2026-09-28T17:36:00.000Z",
  endsAt: "2026-09-28T20:00:00.000Z",
  status: "requested",
  submittedAt: "2026-09-12T21:05:00.000Z",
  organiserId: "10000000-0000-0000-0000-000000000001",
  organiserName: "jasmine",
  assignedCoordinatorName: "Joyce Coordinator",
  venue: {
    preferredLocation: "Main Auditorium",
    minimumCapacity: 100,
    accessibilityNotes: "Wheelchair ramp required",
    layoutNotes: "Theatre style seating",
    facilities: ["Projector", "Microphones"],
  },
  equipment: [{ equipmentName: "Laptop", quantity: 2, notes: "For registration desk" }],
  registration: {
    required: true,
    opensAt: "2026-09-15T00:00:00.000Z",
    closesAt: "2026-09-25T00:00:00.000Z",
    capacity: 100,
    waitlistEnabled: true,
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1"]}>
      <Routes>
        <Route path="events/:eventId" element={<EventDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("EventDetailPage", () => {
  beforeEach(() => {
    loadEventDetailMock.mockReset().mockResolvedValue(event);
    listClarificationsMock.mockReset().mockResolvedValue([]);
  });

  it("shows the full event detail a card cannot fit", async () => {
    renderPage();

    expect(await screen.findByText("Student Leadership Summit 2")).toBeInTheDocument();
    expect(loadEventDetailMock).toHaveBeenCalledWith("event-1");
    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(
      screen.getByText("A full day of workshops for student leaders."),
    ).toBeInTheDocument();
    expect(screen.getByText("Main Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Wheelchair ramp required")).toBeInTheDocument();
    expect(screen.getByText("Projector")).toBeInTheDocument();
    expect(screen.getByText(/Laptop/)).toBeInTheDocument();
    expect(screen.getByText("Organiser: jasmine")).toBeInTheDocument();
    expect(screen.getByText("Coordinator: Joyce Coordinator")).toBeInTheDocument();
  });

  it("shows the coordinator's Request clarification, Approve and Reject actions", async () => {
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Request clarification" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
  });

  it("tells the coordinator the organiser has addressed the clarification", async () => {
    listClarificationsMock.mockResolvedValue([
      {
        id: "clarification-1",
        question: "Can you confirm the headcount?",
        response: "Organiser has addressed the clarification.",
        status: "answered",
        permittedFields: ["expectedAttendance"],
        requestedAt: "2026-09-14T08:00:00.000Z",
        respondedAt: "2026-09-14T09:00:00.000Z",
        resolvedAt: null,
      },
    ]);

    renderPage();

    expect(
      await screen.findByText(
        "Organiser has addressed the clarification — ready for your review.",
      ),
    ).toBeInTheDocument();
    // The badge itself stays neutral (Pending), not a distinct "answered" pill.
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("shows an error state when the event cannot be loaded", async () => {
    loadEventDetailMock.mockRejectedValue(
      new Error("This event is unavailable or you do not have access to it."),
    );

    renderPage();

    expect(
      await screen.findByText("This event is unavailable or you do not have access to it."),
    ).toBeInTheDocument();
  });
});
