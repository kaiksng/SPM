import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  profile: { full_name: "Joyce Coordinator", role: "event_coordinator" },
  user: { id: "coordinator-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));

const loadEventDetailMock = vi.fn();
vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));

const loadEventReadinessMock = vi.fn();
const loadLatestSafetyCheckSubmissionMock = vi.fn();
const submitEventForSafetyCheckMock = vi.fn();
vi.mock("@/features/safety-check/services/event-readiness", () => ({
  loadEventReadiness: (...args: unknown[]) => loadEventReadinessMock(...args),
  loadLatestSafetyCheckSubmission: (...args: unknown[]) => loadLatestSafetyCheckSubmissionMock(...args),
  submitEventForSafetyCheck: (...args: unknown[]) => submitEventForSafetyCheckMock(...args),
  READINESS_ITEM_BADGE_CLASSES: {
    complete: "",
    pending: "",
    needs_review: "",
    not_required: "",
  },
}));

import { EventSafetyCheckPage } from "./EventSafetyCheckPage";

function readiness(overrides: Record<string, unknown> = {}) {
  return {
    ready: true,
    venues: [{ bookingId: "booking-1", venueName: "Main Hall", isMainVenue: true, status: "complete" }],
    venueArrangementStatus: "complete",
    equipment: [],
    equipmentArrangementStatus: "not_required",
    outstandingItems: [],
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/events/event-1/safety-check"]}>
      <Routes>
        <Route path="events/:eventId/safety-check" element={<EventSafetyCheckPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadEventDetailMock.mockReset().mockResolvedValue({
    id: "event-1",
    title: "Spring Expo",
    status: "planning",
    assignedCoordinatorId: "coordinator-1",
  });
  loadEventReadinessMock.mockReset().mockResolvedValue(readiness());
  loadLatestSafetyCheckSubmissionMock.mockReset().mockResolvedValue(null);
  submitEventForSafetyCheckMock.mockReset().mockResolvedValue({ round: 1 });
});

describe("EventSafetyCheckPage", () => {
  // AC01/AC02/AC07.
  it("shows each venue booking and equipment requirement's status", async () => {
    loadEventReadinessMock.mockResolvedValue(
      readiness({
        equipment: [{ requirementId: "req-1", equipmentName: "Mic", status: "pending" }],
        equipmentArrangementStatus: "pending",
      }),
    );
    renderPage();

    expect(await screen.findByText("Main Hall")).toBeInTheDocument();
    expect(screen.getByText("Main venue")).toBeInTheDocument();
    expect(screen.getByText("Mic")).toBeInTheDocument();
  });

  // AC05: Ready and the assigned coordinator -> submit is enabled.
  it("lets the assigned coordinator submit when the event is Ready", async () => {
    const user = userEvent.setup();
    renderPage();

    const button = await screen.findByRole("button", { name: "Submit for Safety Check" });
    expect(button).toBeEnabled();

    await user.click(button);
    expect(submitEventForSafetyCheckMock).toHaveBeenCalledWith("event-1");
  });

  // AC05/AC04: not Ready -> submission is blocked and outstanding items are listed.
  it("blocks submission and lists outstanding items when the event is not Ready", async () => {
    loadEventReadinessMock.mockResolvedValue(
      readiness({
        ready: false,
        venueArrangementStatus: "pending",
        outstandingItems: [{ code: "no_main_venue", message: "Choose a main venue booking before submitting." }],
      }),
    );
    renderPage();

    expect(await screen.findByText("Choose a main venue booking before submitting.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit for Safety Check" })).toBeDisabled();
  });

  // Only the assigned coordinator may submit.
  it("hides the submit action from anyone other than the assigned coordinator", async () => {
    loadEventDetailMock.mockResolvedValue({
      id: "event-1",
      title: "Spring Expo",
      status: "planning",
      assignedCoordinatorId: "coordinator-2",
    });
    renderPage();

    expect(await screen.findByText("Main Hall")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit for Safety Check" })).not.toBeInTheDocument();
  });

  // AC06: once submitted, a read-only banner names the round.
  it("shows a read-only banner once the event is Pending Safety Check", async () => {
    loadEventDetailMock.mockResolvedValue({
      id: "event-1",
      title: "Spring Expo",
      status: "pending_safety_check",
      assignedCoordinatorId: "coordinator-1",
    });
    loadLatestSafetyCheckSubmissionMock.mockResolvedValue({ round: 2, submittedAt: "2099-01-01T00:00:00Z" });
    renderPage();

    expect(await screen.findByText(/Submitted — round 2/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit for Safety Check" })).not.toBeInTheDocument();
  });

  it("shows the submission error without changing the checklist", async () => {
    const user = userEvent.setup();
    submitEventForSafetyCheckMock.mockRejectedValue(new Error("This event is not ready for the safety check."));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Submit for Safety Check" }));

    expect(await screen.findByText("This event is not ready for the safety check.")).toBeInTheDocument();
  });
});
