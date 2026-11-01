import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

import {
  getClarificationReviewState,
  listClarifications,
  requestClarification,
  resolveClarification,
  respondToClarification,
} from "./clarifications";

beforeEach(() => {
  fromMock.mockReset();
  apiFetchMock.mockReset().mockResolvedValue({ data: {} });
});

describe("listClarifications", () => {
  // SPM-09 AC05: the Pre-Approved section lists clarification rounds oldest first.
  it("reads the event's clarification rounds oldest first", async () => {
    const query = queryBuilder({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await listClarifications("event-1");

    expect(fromMock).toHaveBeenCalledWith("clarifications");
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.order).toHaveBeenCalledWith("requested_at", { ascending: true });
  });

  // SPM-09 AC05: each Pre-Approved round carries when it was requested, answered and resolved.
  it("maps each round with when it was requested, answered and resolved", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: "clarification-1",
            question: "Can you confirm the headcount?",
            response: "80 attendees.",
            status: "resolved",
            permitted_fields: ["expectedAttendance"],
            requested_at: "2099-01-01T02:00:00.000Z",
            responded_at: "2099-01-01T03:00:00.000Z",
            resolved_at: "2099-01-01T04:00:00.000Z",
          },
        ],
        error: null,
      }),
    );

    await expect(listClarifications("event-1")).resolves.toEqual([
      {
        id: "clarification-1",
        question: "Can you confirm the headcount?",
        response: "80 attendees.",
        status: "resolved",
        permittedFields: ["expectedAttendance"],
        requestedAt: "2099-01-01T02:00:00.000Z",
        respondedAt: "2099-01-01T03:00:00.000Z",
        resolvedAt: "2099-01-01T04:00:00.000Z",
      },
    ]);
  });

  // SPM-09 AC05 (error case): a failed load gives a readable message, not a raw error.
  it("throws a readable error when the rounds cannot be loaded", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "XX000", message: "connection reset" } }),
    );

    await expect(listClarifications("event-1")).rejects.toThrow(
      "We couldn't load the clarification history.",
    );
  });
});

describe("getClarificationReviewState", () => {
  // SPM-6 AC02: an unresolved round is what shows Awaiting Organiser on the card.
  it("SPM-6 AC02: returns the latest unresolved round's status and fields", async () => {
    const query = queryBuilder({ data: { status: "open", permitted_fields: ["purpose"] }, error: null });
    fromMock.mockReturnValue(query);

    await expect(getClarificationReviewState("event-1")).resolves.toEqual({
      status: "open",
      permittedFields: ["purpose"],
    });
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.in).toHaveBeenCalledWith("status", ["open", "answered"]);
    expect(query.order).toHaveBeenCalledWith("requested_at", { ascending: false });
  });

  it("returns nothing when no round is unresolved", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(getClarificationReviewState("event-1")).resolves.toBeUndefined();
  });

  it("shows no badge, rather than blocking the card, when the read fails", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "denied" } }));

    await expect(getClarificationReviewState("event-1")).resolves.toBeUndefined();
  });
});

describe("clarification actions", () => {
  // SPM-6 AC01: the request carries the information needed and the fields the organiser may change.
  it("SPM-6 AC01: sends the question and permitted fields to the event's route", async () => {
    await requestClarification("event-1", "What is the budget?", ["purpose"]);

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/clarifications", {
      method: "POST",
      body: JSON.stringify({ question: "What is the budget?", permittedFields: ["purpose"] }),
    });
  });

  // SPM-6 AC04: the organiser's response is what gets recorded.
  it("SPM-6 AC04: sends the organiser's response to that clarification", async () => {
    await respondToClarification("clarification-1", "About $500");

    expect(apiFetchMock).toHaveBeenCalledWith("/clarifications/clarification-1/respond", {
      method: "POST",
      body: JSON.stringify({ response: "About $500" }),
    });
  });

  // SPM-6 AC06: a coordinator closes the clarification explicitly.
  it("SPM-6 AC06: asks the backend to close that clarification", async () => {
    await resolveClarification("clarification-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/clarifications/clarification-1/resolve", { method: "POST" });
  });

  // SPM-6 AC08: anyone but an authorised coordinator is refused by the backend.
  it("SPM-6 AC08: lets the backend's refusal reach the page", async () => {
    apiFetchMock.mockRejectedValue(new Error("Only the assigned coordinator can request clarification for this event"));

    await expect(requestClarification("event-1", "Why?", [])).rejects.toThrow(
      "Only the assigned coordinator can request clarification for this event",
    );
  });
});
