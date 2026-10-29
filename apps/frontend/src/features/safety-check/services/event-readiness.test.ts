import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, rpcMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  rpcMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock, rpc: rpcMock } }));
vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiFetch: apiFetchMock };
});

import { ApiError } from "@/lib/api-client";

import {
  loadEventReadiness,
  loadLatestSafetyCheckSubmission,
  loadSafetyReviewDetails,
  submitEventForSafetyCheck,
} from "./event-readiness";

describe("loadEventReadiness", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  it("returns the readiness payload from the RPC", async () => {
    const readiness = {
      ready: true,
      venues: [],
      venueArrangementStatus: "complete",
      equipment: [],
      equipmentArrangementStatus: "not_required",
      outstandingItems: [],
    };
    rpcMock.mockResolvedValue({ data: readiness, error: null });

    await expect(loadEventReadiness("event-1")).resolves.toEqual(readiness);
    expect(rpcMock).toHaveBeenCalledWith("event_readiness", { p_event_id: "event-1" });
  });

  it("throws when the RPC errors", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "nope" } });

    await expect(loadEventReadiness("event-1")).rejects.toThrow(
      "This event's readiness could not be checked.",
    );
  });
});

describe("loadSafetyReviewDetails", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  // SPM-90 AC02: the review facts come from the read-only RPC.
  it("returns the review details from the RPC", async () => {
    const details = { expectedAttendance: 80, accessibilityNeeds: null, layoutPreference: null, venues: [], equipment: [] };
    rpcMock.mockResolvedValue({ data: details, error: null });

    await expect(loadSafetyReviewDetails("event-1")).resolves.toEqual(details);
    expect(rpcMock).toHaveBeenCalledWith("safety_check_review_details", { p_event_id: "event-1" });
  });

  it("throws when the RPC errors or returns nothing", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(loadSafetyReviewDetails("event-1")).rejects.toThrow(
      "This event's review details could not be loaded.",
    );

    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(loadSafetyReviewDetails("event-1")).rejects.toThrow(
      "This event's review details could not be loaded.",
    );
  });
});

describe("submitEventForSafetyCheck", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  // AC05.
  it("returns the round on success", async () => {
    apiFetchMock.mockResolvedValue({ data: { eventId: "event-1", status: "pending_safety_check", round: 2 } });

    await expect(submitEventForSafetyCheck("event-1")).resolves.toEqual({
      eventId: "event-1",
      status: "pending_safety_check",
      round: 2,
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/submit-safety-check", { method: "POST" });
  });

  // AC05: outstanding items carried through as a SafetyCheckSubmissionError.
  it("throws a SafetyCheckSubmissionError with outstanding items on a 422", async () => {
    const fields = [{ code: "no_main_venue", message: "Choose a main venue booking before submitting." }];
    apiFetchMock.mockRejectedValue(new ApiError("This event is not ready for the safety check", 422, fields));

    await expect(submitEventForSafetyCheck("event-1")).rejects.toMatchObject({
      name: "SafetyCheckSubmissionError",
      message: "This event is not ready for the safety check",
      outstandingItems: fields,
    });
  });

  it("throws a plain message when the backend returns no fields", async () => {
    apiFetchMock.mockRejectedValue(new ApiError("Only the assigned coordinator can submit this event", 403));

    await expect(submitEventForSafetyCheck("event-1")).rejects.toMatchObject({
      message: "Only the assigned coordinator can submit this event",
      outstandingItems: undefined,
    });
  });
});

describe("loadLatestSafetyCheckSubmission", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("returns null when there is no submission yet", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(loadLatestSafetyCheckSubmission("event-1")).resolves.toBeNull();
  });

  it("returns the latest round and timestamp", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: { round: 2, submitted_at: "2099-01-01T00:00:00Z" }, error: null }),
    );

    await expect(loadLatestSafetyCheckSubmission("event-1")).resolves.toEqual({
      round: 2,
      submittedAt: "2099-01-01T00:00:00Z",
    });
  });

  it("throws when the query errors", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "nope" } }));

    await expect(loadLatestSafetyCheckSubmission("event-1")).rejects.toThrow(
      "This event's safety check submission is unavailable.",
    );
  });
});
