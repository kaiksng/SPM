import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { hasPendingChangeRequest, listEventChangeRequests } from "./change-requests";

beforeEach(() => {
  fromMock.mockReset();
});

describe("listEventChangeRequests", () => {
  // AC06: the organiser views the request history oldest round first.
  it("reads the event's change requests oldest first", async () => {
    const query = queryBuilder({ data: [], error: null });
    fromMock.mockReturnValue(query);

    await listEventChangeRequests("event-1");

    expect(fromMock).toHaveBeenCalledWith("event_change_requests");
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.order).toHaveBeenCalledWith("requested_at", { ascending: true });
  });

  // AC06: the organiser views each request's status, outcome, and reason.
  it("maps each request with its status, reason and review outcome", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [
          {
            id: "change-request-1",
            requested_changes: { description: "Move the start time" },
            reason: "Speaker rescheduled",
            status: "approved",
            review_notes: "Looks fine.",
            requested_at: "2099-01-01T02:00:00.000Z",
            reviewed_at: "2099-01-01T03:00:00.000Z",
            withdrawn_at: null,
          },
        ],
        error: null,
      }),
    );

    await expect(listEventChangeRequests("event-1")).resolves.toEqual([
      {
        id: "change-request-1",
        requestedChanges: { description: "Move the start time" },
        reason: "Speaker rescheduled",
        status: "approved",
        reviewNotes: "Looks fine.",
        requestedAt: "2099-01-01T02:00:00.000Z",
        reviewedAt: "2099-01-01T03:00:00.000Z",
        withdrawnAt: null,
      },
    ]);
  });

  it("throws a readable error when the history cannot be loaded", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "XX000", message: "connection reset" } }),
    );

    await expect(listEventChangeRequests("event-1")).rejects.toThrow(
      "We couldn't load the change request history.",
    );
  });
});

describe("hasPendingChangeRequest", () => {
  // SPM-38: the card badge's cheap lookup, same shape as
  // getClarificationReviewState — only whether one is pending.
  it("returns true when a pending request exists", async () => {
    const query = queryBuilder({ data: { id: "change-request-1" }, error: null });
    fromMock.mockReturnValue(query);

    await expect(hasPendingChangeRequest("event-1")).resolves.toBe(true);

    expect(fromMock).toHaveBeenCalledWith("event_change_requests");
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.eq).toHaveBeenCalledWith("status", "pending");
    expect(query.limit).toHaveBeenCalledWith(1);
  });

  it("returns false when nothing is pending", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(hasPendingChangeRequest("event-1")).resolves.toBe(false);
  });

  it("fails closed to false rather than blocking the card", async () => {
    fromMock.mockReturnValue(
      queryBuilder({ data: null, error: { code: "XX000", message: "connection reset" } }),
    );

    await expect(hasPendingChangeRequest("event-1")).resolves.toBe(false);
  });
});
