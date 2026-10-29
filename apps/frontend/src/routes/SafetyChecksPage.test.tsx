import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = {
  profile: { full_name: "Sam Safety", role: "safety_officer" },
  user: { id: "safety-1" },
  loading: false,
  session: {},
};

const listPendingSafetyCheckEventsMock = vi.fn();

vi.mock("@/context/auth-context", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/features/safety-check/services/safety-check-decisions", () => ({
  listPendingSafetyCheckEvents: () => listPendingSafetyCheckEventsMock(),
}));

import { SafetyChecksPage } from "./SafetyChecksPage";

const PENDING_EVENT = {
  eventId: "event-1",
  title: "Alumni Homecoming Mixer",
  organiserName: "Marcus Tan",
  coordinatorName: "Priya Patel",
  startsAt: "2099-04-06T02:00:00.000Z",
  endsAt: "2099-04-06T04:00:00.000Z",
  expectedAttendance: 120,
  round: 1,
  submittedAt: "2026-10-20T09:00:00.000Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/safety-checks"]}>
      <SafetyChecksPage />
    </MemoryRouter>,
  );
}

describe("SafetyChecksPage", () => {
  beforeEach(() => {
    authState.profile.role = "safety_officer";
    listPendingSafetyCheckEventsMock.mockReset().mockResolvedValue([PENDING_EVENT]);
  });

  // SPM-77/this story: the Safety Officer's queue of events awaiting review.
  it("lists pending safety check events for a signed-in safety officer", async () => {
    renderPage();

    expect(await screen.findByText("Alumni Homecoming Mixer")).toBeInTheDocument();
    expect(screen.getByText("Organiser: Marcus Tan")).toBeInTheDocument();
    expect(screen.getByText("Coordinator: Priya Patel")).toBeInTheDocument();
    expect(screen.getByText("Round 1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Alumni Homecoming Mixer/ })).toHaveAttribute(
      "href",
      "/safety-checks/event-1",
    );
  });

  it("shows an empty state when nothing is pending", async () => {
    listPendingSafetyCheckEventsMock.mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText("Nothing to review")).toBeInTheDocument();
  });

  it("shows an error if the queue fails to load", async () => {
    listPendingSafetyCheckEventsMock.mockRejectedValue(new Error("boom"));
    renderPage();

    expect(await screen.findByText("boom")).toBeInTheDocument();
  });

  // Another role is denied the safety page with a clear message.
  it("denies another role with a clear message", () => {
    authState.profile.role = "event_coordinator_lead";

    renderPage();

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.queryByText("Pending safety checks")).not.toBeInTheDocument();
  });
});

// SPM-90 AC01: the queue shows what is known about each event and copes with what is not.
describe("SafetyChecksPage queue details", () => {
  beforeEach(() => {
    authState.profile.role = "safety_officer";
    listPendingSafetyCheckEventsMock.mockReset().mockResolvedValue([PENDING_EVENT]);
  });

  it("shows 'Unknown' for a missing organiser or coordinator, and 'Schedule not set' for a missing schedule", async () => {
    listPendingSafetyCheckEventsMock.mockResolvedValue([
      { ...PENDING_EVENT, organiserName: null, coordinatorName: null, startsAt: null, endsAt: null, expectedAttendance: null, round: null },
    ]);
    renderPage();

    expect(await screen.findByText("Organiser: Unknown")).toBeInTheDocument();
    expect(screen.getByText("Coordinator: Unknown")).toBeInTheDocument();
    expect(screen.getByText("Schedule not set")).toBeInTheDocument();
    expect(screen.queryByText(/attendees/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Round/)).not.toBeInTheDocument();
  });

  // SPM-90 AC04: after approving, the Safety Officer returns to the queue and is told the event is Confirmed.
  it("shows the notice handed over after a decision", async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: "/safety-checks", state: { notice: '"Alumni Homecoming Mixer" approved — it\'s now Confirmed.' } }]}>
        <SafetyChecksPage />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("approved — it's now Confirmed.");
  });

  it("shows the expected attendance when it is known", async () => {
    renderPage();

    expect(await screen.findByText(/~120 attendees/)).toBeInTheDocument();
  });

  it("uses a plain message when the queue fails to load without one", async () => {
    listPendingSafetyCheckEventsMock.mockRejectedValue("boom");
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("The safety check queue is unavailable.");
  });

  it("ignores a queue that arrives after the Safety Officer has left the page", async () => {
    let resolveQueue: (items: unknown[]) => void = () => {};
    listPendingSafetyCheckEventsMock.mockReturnValueOnce(new Promise((resolve) => { resolveQueue = resolve; }));
    const first = renderPage();
    first.unmount();
    resolveQueue([PENDING_EVENT]);

    let rejectQueue: (reason: unknown) => void = () => {};
    listPendingSafetyCheckEventsMock.mockReturnValueOnce(new Promise((_, reject) => { rejectQueue = reject; }));
    const second = renderPage();
    second.unmount();
    rejectQueue(new Error("too late"));

    await waitFor(() => expect(listPendingSafetyCheckEventsMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("Alumni Homecoming Mixer")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

