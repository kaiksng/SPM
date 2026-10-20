import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const loadEventReadinessMock = vi.fn();
const loadLatestSafetyCheckSubmissionMock = vi.fn();
const decideEventSafetyCheckMock = vi.fn();
const navigateMock = vi.fn();

const authState = {
  profile: { full_name: "Sam Safety", role: "safety_officer" },
  user: { id: "safety-1" },
  loading: false,
  session: {},
};

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/features/event-requests/services/event-details", () => ({
  loadEventDetail: (...args: unknown[]) => loadEventDetailMock(...args),
}));
vi.mock("@/features/safety-check/services/event-readiness", () => ({
  loadEventReadiness: (...args: unknown[]) => loadEventReadinessMock(...args),
  loadLatestSafetyCheckSubmission: (...args: unknown[]) => loadLatestSafetyCheckSubmissionMock(...args),
  READINESS_ITEM_BADGE_CLASSES: {
    complete: "bg-emerald-100 text-emerald-800",
    pending: "bg-slate-200 text-slate-600",
    needs_review: "bg-orange-200 text-orange-900",
    not_required: "bg-slate-100 text-slate-500",
  },
}));
vi.mock("@/features/safety-check/services/safety-check-decisions", () => ({
  decideEventSafetyCheck: (...args: unknown[]) => decideEventSafetyCheckMock(...args),
}));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("react-router", async () => {
  const actual = await vi.importActual<typeof import("react-router")>("react-router");
  return { ...actual, useNavigate: () => navigateMock };
});

import { SafetyCheckReviewPage } from "./SafetyCheckReviewPage";

const event = {
  id: "event-1",
  title: "Alumni Homecoming Mixer",
  purpose: "Mixer",
  description: "",
  eventType: "Social",
  expectedAttendance: 120,
  startsAt: "2099-04-06T02:00:00.000Z",
  endsAt: "2099-04-06T04:00:00.000Z",
  status: "pending_safety_check",
  submittedAt: "2026-10-01T00:00:00.000Z",
  organiserId: "org-1",
  organiserName: "Marcus Tan",
  assignedCoordinatorId: "coord-1",
  assignedCoordinatorName: "Priya Patel",
  venue: { preferredLocation: "", minimumCapacity: null, accessibilityNotes: null, layoutNotes: "", facilities: [] },
  equipment: [],
  registration: { required: false, opensAt: null, closesAt: null, capacity: null, waitlistEnabled: false },
};

const readiness = {
  ready: true,
  venues: [
    {
      bookingId: "booking-1",
      venueName: "Main Auditorium",
      isMainVenue: true,
      status: "complete" as const,
      needsReviewReason: null,
    },
  ],
  venueArrangementStatus: "complete" as const,
  equipment: [
    {
      requirementId: "req-1",
      equipmentName: "Projector",
      quantity: 2,
      status: "complete" as const,
      needsReviewReason: null,
    },
  ],
  equipmentArrangementStatus: "complete" as const,
  outstandingItems: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/safety-checks/event-1"]}>
      <Routes>
        <Route path="safety-checks/:eventId" element={<SafetyCheckReviewPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  loadEventDetailMock.mockReset().mockResolvedValue(event);
  loadEventReadinessMock.mockReset().mockResolvedValue(readiness);
  loadLatestSafetyCheckSubmissionMock
    .mockReset()
    .mockResolvedValue({ round: 1, submittedAt: "2026-10-20T09:00:00.000Z" });
  decideEventSafetyCheckMock.mockReset().mockResolvedValue({
    eventId: "event-1",
    status: "planning",
    outcome: "rejected",
    flaggedBookingCount: 1,
    flaggedRequirementCount: 1,
  });
  navigateMock.mockReset();
});

describe("SafetyCheckReviewPage", () => {
  it("shows the event, round banner, and arrangement items", async () => {
    renderPage();

    expect(await screen.findByText("Alumni Homecoming Mixer")).toBeInTheDocument();
    expect(screen.getByText("Round 1 submission")).toBeInTheDocument();
    expect(screen.getByText("Main Auditorium")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Projector × 2")).toBeInTheDocument();
  });

  it("shows why a flagged item needs review", async () => {
    loadEventReadinessMock.mockResolvedValue({
      ...readiness,
      venues: [
        {
          bookingId: "booking-1",
          venueName: "Main Auditorium",
          isMainVenue: true,
          status: "needs_review",
          needsReviewReason: "Placement blocks the emergency exit.",
        },
      ],
      venueArrangementStatus: "needs_review",
    });
    renderPage();

    expect(
      await screen.findByText("Placement blocks the emergency exit."),
    ).toBeInTheDocument();
  });

  it("disables Request changes until an item is selected", async () => {
    renderPage();

    const requestChangesButton = await screen.findByRole("button", { name: "Request changes" });
    expect(requestChangesButton).toBeDisabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole("checkbox", { name: "Flag Projector" }));

    expect(requestChangesButton).toBeEnabled();
  });

  it("submits Request changes with only the selected ids, then navigates to the queue", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("checkbox", { name: "Flag Projector" }));
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "Reposition away from the exit.");
    await user.click(within(dialog).getByRole("button", { name: "Request changes" }));

    await waitFor(() =>
      expect(decideEventSafetyCheckMock).toHaveBeenCalledWith(
        "event-1",
        "changes_requested",
        "Reposition away from the exit.",
        [],
        ["req-1"],
      ),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      "/safety-checks",
      expect.objectContaining({ replace: true }),
    );
  });

  it("submits Reject with no item selection required", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reject" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "Crowd plan is incomplete.");
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));

    await waitFor(() =>
      expect(decideEventSafetyCheckMock).toHaveBeenCalledWith(
        "event-1",
        "rejected",
        "Crowd plan is incomplete.",
        [],
        [],
      ),
    );
  });
});
