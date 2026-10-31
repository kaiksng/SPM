import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { safetyReviewRecord } from "@/test/safety-review-fixtures";
const load = vi.hoisted(() => vi.fn());
const auth = { profile: { role: "safety_officer" } };
vi.mock("@/context/auth-context", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-page-title", () => ({ usePageTitle: vi.fn() }));
vi.mock("@/lib/supabase-client", () => ({ supabase: {} }));
vi.mock("@/features/safety-check/services/safety-review-history", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/safety-check/services/safety-review-history")>(),
  loadSafetyReviewHistoryRecord: (...args: unknown[]) => load(...args),
}));
import { SafetyCheckHistoryPage } from "./SafetyCheckHistoryPage";
function renderPage() { return render(<MemoryRouter initialEntries={["/safety-checks/history/12"]}><Routes><Route path="safety-checks/history/:decisionId" element={<SafetyCheckHistoryPage />} /></Routes></MemoryRouter>); }
beforeEach(() => { auth.profile.role = "safety_officer"; load.mockReset().mockResolvedValue(safetyReviewRecord); });
describe("Safety review decision record — SPM-89 AC04", () => {
  it("shows the saved decision and snapshot separately from the current status, without decision controls", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: safetyReviewRecord.title })).toBeInTheDocument();
    expect(screen.getByText("Changes requested")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Current event status" })).getByText("confirmed")).toBeInTheDocument();
    expect(screen.getByText("Original Auditorium · Main venue")).toBeInTheDocument();
    expect(screen.getByText("Projector × 2")).toBeInTheDocument();
    expect(screen.getByText("Flagged for revision")).toBeInTheDocument();
    expect(screen.getByText(safetyReviewRecord.reason!)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve|reject|request changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to review history" })).toHaveAttribute("href", "/safety-checks?tab=history");
  });
  it("links to the new round while keeping this earlier round read-only", async () => {
    load.mockResolvedValue({ ...safetyReviewRecord, currentStatus: "pending_safety_check", currentRound: 2 });
    renderPage();
    expect(await screen.findByText(/Resubmitted for Round 2/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review current submission" })).toHaveAttribute("href", "/safety-checks/event-1");
  });
  it("shows approvals without an optional note", async () => {
    load.mockResolvedValue({ ...safetyReviewRecord, outcome: "approved", reason: null, flaggedRequirementIds: [] });
    renderPage();
    expect(await screen.findByText("No note recorded.")).toBeInTheDocument();
    expect(screen.queryByText("Flagged for revision")).not.toBeInTheDocument();
  });
  it("shows all submitted arrangements as flagged for a rejection", async () => {
    load.mockResolvedValue({ ...safetyReviewRecord, outcome: "rejected", flaggedRequirementIds: [] });
    renderPage();
    expect(await screen.findAllByText("Flagged for revision")).toHaveLength(2);
  });
  it("reports a missing record and a failed load clearly", async () => {
    load.mockResolvedValueOnce(null);
    const first = renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be found");
    first.unmount();
    load.mockRejectedValueOnce(new Error("History unavailable"));
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("History unavailable");
  });
  it("does not fetch records for another role", () => {
    auth.profile.role = "attendee";
    renderPage();
    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(load).not.toHaveBeenCalled();
  });
});
