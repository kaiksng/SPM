import { beforeEach, describe, expect, it, vi } from "vitest";
import { safetyReviewRecord } from "@/test/safety-review-fixtures";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc } }));
import { listSafetyReviewHistory, loadSafetyReviewHistoryRecord } from "./safety-review-history";

beforeEach(() => { rpc.mockReset(); });
describe("safety review history — SPM-89 AC04 / SPM-90 AC03", () => {
  it("loads every page without truncating past reviews", async () => {
    const page = Array.from({ length: 100 }, (_, i) => ({ ...safetyReviewRecord, decisionId: i + 1 }));
    rpc.mockResolvedValueOnce({ data: page, error: null }).mockResolvedValueOnce({ data: [{ ...safetyReviewRecord, decisionId: 101 }], error: null });
    expect(await listSafetyReviewHistory()).toHaveLength(101);
    expect(rpc).toHaveBeenNthCalledWith(2, "safety_check_review_history", { p_limit: 100, p_offset: 100 });
  });
  it("loads one decision without needing general event access", async () => {
    rpc.mockResolvedValue({ data: [safetyReviewRecord], error: null });
    expect(await loadSafetyReviewHistoryRecord(12)).toEqual(safetyReviewRecord);
    expect(rpc).toHaveBeenCalledWith("safety_check_review_history", { p_limit: 100, p_offset: 0, p_decision_id: 12 });
  });
  it("handles empty history and missing decisions", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await listSafetyReviewHistory()).toEqual([]);
    expect(await loadSafetyReviewHistoryRecord(99)).toBeNull();
  });
  it("rejects invalid decision links before calling the server", async () => {
    for (const id of [0, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(loadSafetyReviewHistoryRecord(id)).rejects.toThrow("link is invalid");
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("reports read failures instead of showing empty history", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    await expect(listSafetyReviewHistory()).rejects.toThrow("history is unavailable");
  });
  it("refuses malformed saved data instead of misrepresenting it", async () => {
    rpc.mockResolvedValue({ data: [{ ...safetyReviewRecord, venuesSnapshot: null }], error: null });
    await expect(listSafetyReviewHistory()).rejects.toThrow("response could not be read");
  });
});
