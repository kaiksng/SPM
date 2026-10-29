import { render, screen } from "@testing-library/react";
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
