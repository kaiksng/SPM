import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const loadEventDetailMock = vi.fn();
const loadEventReadinessMock = vi.fn();
const loadLatestSafetyCheckSubmissionMock = vi.fn();
const loadSafetyReviewDetailsMock = vi.fn();
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
  loadSafetyReviewDetails: (...args: unknown[]) => loadSafetyReviewDetailsMock(...args),
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

const reviewDetails = {
  expectedAttendance: 120,
  accessibilityNeeds: null,
  layoutPreference: null,
  venues: [
    {
      bookingId: "booking-1",
      venueName: "Auditorium Review Copy",
      location: "Block A",
      label: "Main programme",
      isMainVenue: true,
      capacity: 100,
      headcount: 120,
      underCapacity: true,
      layouts: ["Theatre"],
      requestedLayoutNotes: null,
      requestedAccessibilityNotes: null,
      venueAccessibilityNotes: null,
      venueDescription: null,
    },
  ],
  equipment: [],
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
  loadSafetyReviewDetailsMock.mockReset().mockResolvedValue(reviewDetails);
  navigateMock.mockReset();
});

describe("SafetyCheckReviewPage", () => {
  it("shows the event, round banner, and arrangement items", async () => {
    renderPage();

    expect(await screen.findByText("Alumni Homecoming Mixer")).toBeInTheDocument();
    expect(screen.getByText("Round 1 submission")).toBeInTheDocument();
    expect(screen.getByText("Main Auditorium")).toBeInTheDocument();
    expect(screen.getAllByText("Main")).toHaveLength(2);
    expect(screen.getByText("Projector × 2")).toBeInTheDocument();
  });

  // SPM-90 AC02: the review facts are on the page, shortfall highlighted.
  it("shows the review facts and highlights a venue below the expected attendance", async () => {
    renderPage();

    expect(await screen.findByText("Auditorium Review Copy")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Expected 120 of capacity 100 — exceeds capacity by 20");
    expect(loadSafetyReviewDetailsMock).toHaveBeenCalledWith("event-1");
  });

  // SPM-90 AC02: event information is read-only for the Safety Officer — the
  // page offers decision buttons; correction checkboxes appear only after choosing Request changes.
  it("offers no way to edit event information", async () => {
    renderPage();

    await screen.findByText("Auditorium Review Copy");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /save|edit|update/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("shows the page as unavailable when the review details cannot be loaded", async () => {
    loadSafetyReviewDetailsMock.mockRejectedValue(new Error("This event's review details could not be loaded."));
    renderPage();

    expect(await screen.findByText("Event unavailable")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This event's review details could not be loaded.");
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
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

  // SPM-89 AC01/AC02: choose a decision before selecting corrections.
  it("shows checkboxes only inside Request changes and requires a selection and reason", async () => {
    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole("button", { name: "Request changes" });
    expect(button).toBeEnabled();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Request changes" });
    const submit = within(dialog).getByRole("button", { name: "Send change request" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Reason"), "Move equipment away from the exit.");
    expect(submit).toBeDisabled();
    await user.click(within(dialog).getByRole("checkbox", { name: "Flag Projector" }));
    expect(submit).toBeEnabled();
    await user.clear(within(dialog).getByLabelText("Reason"));
    expect(submit).toBeDisabled();
    expect(decideEventSafetyCheckMock).not.toHaveBeenCalled();
  });

  it("discards correction selections when cancelled and keeps approval free of checkboxes", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "Flag Projector" }));
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request changes" }));
    expect(await screen.findByRole("checkbox", { name: "Flag Projector" })).not.toBeChecked();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Approve" }));
    const approval = await screen.findByRole("dialog", { name: "Approve safety arrangement" });
    expect(within(approval).queryByRole("checkbox")).not.toBeInTheDocument();
    await user.click(within(approval).getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(decideEventSafetyCheckMock).toHaveBeenCalledWith("event-1", "approved", "", [], [], []));
  });

  it("submits Request changes with only the selected ids, then navigates to the queue", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "Flag Projector" }));
    await user.type(within(dialog).getByLabelText("Reason"), "Reposition away from the exit.");
    await user.click(within(dialog).getByRole("button", { name: "Send change request" }));

    await waitFor(() =>
      expect(decideEventSafetyCheckMock).toHaveBeenCalledWith(
        "event-1",
        "changes_requested",
        "Reposition away from the exit.",
        [],
        ["req-1"],
        [],
      ),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      "/safety-checks",
      expect.objectContaining({ replace: true }),
    );
  });

  // SPM-90: the Safety Officer can flag the coordinator's safety checks.
  it("lets the Safety Officer flag safety checks when requesting changes", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Request changes" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: "Flag Emergency access" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Flag Equipment placement" }));
    await user.type(within(dialog).getByLabelText("Reason"), "The rear exit is blocked by the stage.");
    await user.click(within(dialog).getByRole("button", { name: "Send change request" }));

    await waitFor(() =>
      expect(decideEventSafetyCheckMock).toHaveBeenCalledWith(
        "event-1",
        "changes_requested",
        "The rear exit is blocked by the stage.",
        [],
        [],
        ["emergency_access", "equipment_placement"],
      ),
    );
  });

  it("submits Reject with no item selection required", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Reject safety arrangement" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Reason"), "Crowd plan is incomplete.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm rejection" }));

    await waitFor(() =>
      expect(decideEventSafetyCheckMock).toHaveBeenCalledWith(
        "event-1",
        "rejected",
        "Crowd plan is incomplete.",
        [],
        [],
        [],
      ),
    );
  });

  // This story: Approve, with no reason required.
  // SPM-90 AC03: Approve (note optional) moves the event to Confirmed.
  it("submits Approve with no reason and navigates with a confirmation notice", async () => {
    decideEventSafetyCheckMock.mockResolvedValue({
      eventId: "event-1",
      status: "confirmed",
      outcome: "approved",
      flaggedBookingCount: 0,
      flaggedRequirementCount: 0,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));

    await waitFor(() =>
      expect(decideEventSafetyCheckMock).toHaveBeenCalledWith("event-1", "approved", "", [], [], []),
    );
    expect(navigateMock).toHaveBeenCalledWith(
      "/safety-checks",
      expect.objectContaining({
        replace: true,
        state: expect.objectContaining({ notice: '"Alumni Homecoming Mixer" approved — it\'s now Confirmed.', decisionEventId: "event-1", decisionRound: 1 }),
      }),
    );
  });

  it("submits Approve with an optional note", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Note (optional)"), "Looks good.");
    await user.click(within(dialog).getByRole("button", { name: "Confirm approval" }));

    await waitFor(() =>
      expect(decideEventSafetyCheckMock).toHaveBeenCalledWith(
        "event-1",
        "approved",
        "Looks good.",
        [],
        [],
        [],
      ),
    );
  });
});

// SPM-90 AC03/AC05: approving from the review page, and what happens when the page or the decision fails.
describe("SafetyCheckReviewPage approving and loading", () => {
  it("closes the decision dialog without deciding when the Safety Officer cancels", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(decideEventSafetyCheckMock).not.toHaveBeenCalled();
  });

  // SPM-90 AC05: an event that is no longer Pending Safety Check cannot be approved; the refusal is shown.
  it("shows why an approval was refused, on the page and in the dialog, and stays on the review", async () => {
    const user = userEvent.setup();
    decideEventSafetyCheckMock.mockRejectedValueOnce(new Error("Only an event Pending Safety Check can be decided"));
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm approval" }));

    expect((await screen.findAllByText("Only an event Pending Safety Check can be decided")).length).toBeGreaterThanOrEqual(1);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("uses a plain message when a decision fails without one", async () => {
    const user = userEvent.setup();
    decideEventSafetyCheckMock.mockRejectedValueOnce("boom");
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Approve" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm approval" }));

    expect((await screen.findAllByText("This decision could not be submitted.")).length).toBeGreaterThanOrEqual(1);
  });

  it("says why the review could not be loaded, with a plain message when none is given", async () => {
    loadEventDetailMock.mockRejectedValueOnce(new Error("Event not found or you do not have access to it"));
    const failed = renderPage();
    expect(await screen.findByText("Event unavailable")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Event not found or you do not have access to it");
    failed.unmount();

    loadEventDetailMock.mockRejectedValueOnce("boom");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("This event is unavailable or you do not have access to it.");
  });

  it("loads nothing when the page address names no event", () => {
    render(
      <MemoryRouter initialEntries={["/safety-checks"]}>
        <Routes>
          <Route path="safety-checks" element={<SafetyCheckReviewPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(loadEventDetailMock).not.toHaveBeenCalled();
    expect(loadSafetyReviewDetailsMock).not.toHaveBeenCalled();
  });

  it("ignores a response that arrives after the Safety Officer has left the page", async () => {
    let resolveEvent: (value: unknown) => void = () => {};
    loadEventDetailMock.mockReturnValueOnce(new Promise((resolve) => { resolveEvent = resolve; }));
    const first = renderPage();
    first.unmount();
    resolveEvent(event);

    let rejectEvent: (reason: unknown) => void = () => {};
    loadEventDetailMock.mockReturnValueOnce(new Promise((_, reject) => { rejectEvent = reject; }));
    const second = renderPage();
    second.unmount();
    rejectEvent(new Error("too late"));

    await waitFor(() => expect(loadEventDetailMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Alumni Homecoming Mixer")).not.toBeInTheDocument();
    expect(screen.queryByText("Event unavailable")).not.toBeInTheDocument();
  });

  it("shows the event as having no schedule or attendance when the organiser left them out", async () => {
    loadEventDetailMock.mockResolvedValue({ ...event, startsAt: null, endsAt: null, expectedAttendance: null });
    renderPage();

    expect(await screen.findByText("Schedule not set")).toBeInTheDocument();
    expect(screen.queryByText(/attendees/)).not.toBeInTheDocument();
  });

  it("still opens the review when the latest submission cannot be read", async () => {
    loadLatestSafetyCheckSubmissionMock.mockRejectedValue(new Error("not readable"));
    renderPage();

    expect(await screen.findByText("Alumni Homecoming Mixer")).toBeInTheDocument();
    expect(screen.queryByText(/submission$/)).not.toBeInTheDocument();
  });
});

