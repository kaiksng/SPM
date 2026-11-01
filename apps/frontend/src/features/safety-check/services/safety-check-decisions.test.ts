import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, apiFetchMock } = vi.hoisted(() => ({ fromMock: vi.fn(), apiFetchMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

import { decideEventSafetyCheck, listPendingSafetyCheckEvents } from "./safety-check-decisions";

function eventRow(id: string, title: string) {
  return {
    id,
    title,
    starts_at: "2099-01-01T02:00:00Z",
    ends_at: "2099-01-01T04:00:00Z",
    expected_attendance: 50,
    organiser: { full_name: "Org" },
    coordinator: { full_name: "Coord" },
  };
}

describe("listPendingSafetyCheckEvents", () => {
  beforeEach(() => {
    fromMock.mockReset();
    apiFetchMock.mockReset();
  });

  // SPM-90 AC01: oldest submission first, using each event's latest round.
  it("orders the queue by latest submission time, oldest first, unsubmitted last", async () => {
    const events = queryBuilder({
      data: [eventRow("e-new", "Newest"), eventRow("e-none", "No record"), eventRow("e-old", "Oldest")],
      error: null,
    });
    const submissions = queryBuilder({
      data: [
        { event_id: "e-new", round: 1, submitted_at: "2026-10-22T09:00:00Z" },
        { event_id: "e-old", round: 2, submitted_at: "2026-10-20T09:00:00Z" },
        { event_id: "e-old", round: 1, submitted_at: "2026-10-01T09:00:00Z" },
      ],
      error: null,
    });
    fromMock.mockReturnValueOnce(events).mockReturnValueOnce(submissions);

    const queue = await listPendingSafetyCheckEvents();

    expect(queue.map((item) => item.eventId)).toEqual(["e-old", "e-new", "e-none"]);
    expect(queue[0]).toMatchObject({ round: 2, submittedAt: "2026-10-20T09:00:00Z" });
    expect(queue[2]).toMatchObject({ round: null, submittedAt: null });
  });

  // SPM-90 AC01: an empty queue is returned as an empty list (the page shows the message).
  it("returns an empty queue when nothing is pending", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: [], error: null }));

    await expect(listPendingSafetyCheckEvents()).resolves.toEqual([]);
  });

  it("throws when the events query fails", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: { message: "nope" } }));

    await expect(listPendingSafetyCheckEvents()).rejects.toThrow("The safety check queue is unavailable.");
  });

  it("lists an event with no organiser, coordinator or submission record, after those that have one", async () => {
    fromMock
      .mockReturnValueOnce(
        queryBuilder({
          data: [
            { ...eventRow("e-bare", "Bare"), organiser: null, coordinator: null },
            { ...eventRow("e-sub", "Submitted"), organiser: null, coordinator: null },
          ],
          error: null,
        }),
      )
      .mockReturnValueOnce(queryBuilder({ data: [{ event_id: "e-sub", round: 1, submitted_at: "2026-10-20T09:00:00Z" }], error: null }));

    const queue = await listPendingSafetyCheckEvents();

    expect(queue.map((item) => item.eventId)).toEqual(["e-sub", "e-bare"]);
    expect(queue[0]).toMatchObject({ organiserName: null, coordinatorName: null });
  });

  it("keeps events in their order when none has a submission record", async () => {
    fromMock
      .mockReturnValueOnce(queryBuilder({ data: [eventRow("e-1", "One"), eventRow("e-2", "Two")], error: null }))
      .mockReturnValueOnce(queryBuilder({ data: null, error: null }));

    const queue = await listPendingSafetyCheckEvents();

    expect(queue.map((item) => item.eventId)).toEqual(["e-1", "e-2"]);
    expect(queue.every((item) => item.round === null && item.submittedAt === null)).toBe(true);
  });
});

describe("decideEventSafetyCheck", () => {
  // SPM-90 AC03: the approval is sent to the backend, which records the reviewer and notifies.
  it("sends an approval with its note and no flagged items", async () => {
    apiFetchMock.mockResolvedValue({ data: { eventId: "event-1", status: "confirmed", outcome: "approved", flaggedBookingCount: 0, flaggedRequirementCount: 0 } });

    const result = await decideEventSafetyCheck("event-1", "approved", "All clear");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/safety-check-decision", {
      method: "POST",
      body: JSON.stringify({ decision: "approved", reason: "All clear", flaggedBookingIds: [], flaggedRequirementIds: [], flaggedSafetyChecks: [] }),
    });
    expect(result).toMatchObject({ status: "confirmed", outcome: "approved" });
  });

  it("sends the flagged items when changes are requested", async () => {
    apiFetchMock.mockResolvedValue({ data: { eventId: "event-1", status: "planning", outcome: "changes_requested", flaggedBookingCount: 1, flaggedRequirementCount: 1 } });

    await decideEventSafetyCheck("event-1", "changes_requested", "Exit blocked", ["booking-1"], ["req-1"]);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/events/event-1/safety-check-decision",
      expect.objectContaining({ body: JSON.stringify({ decision: "changes_requested", reason: "Exit blocked", flaggedBookingIds: ["booking-1"], flaggedRequirementIds: ["req-1"], flaggedSafetyChecks: [] }) }),
    );
  });

  // SPM-90: flagged safety checks are sent too.
  it("sends the flagged safety checks", async () => {
    apiFetchMock.mockResolvedValue({ data: { eventId: "event-1", status: "planning", outcome: "changes_requested" } });

    await decideEventSafetyCheck("event-1", "changes_requested", "Exit blocked", [], [], ["emergency_access"]);

    expect(apiFetchMock).toHaveBeenCalledWith(
      "/events/event-1/safety-check-decision",
      expect.objectContaining({
        body: JSON.stringify({
          decision: "changes_requested",
          reason: "Exit blocked",
          flaggedBookingIds: [],
          flaggedRequirementIds: [],
          flaggedSafetyChecks: ["emergency_access"],
        }),
      }),
    );
  });

  it("lets the backend's refusal reach the page", async () => {
    apiFetchMock.mockRejectedValue(new Error("Only a Safety Officer can decide an event's safety check"));

    await expect(decideEventSafetyCheck("event-1", "approved", "")).rejects.toThrow("Only a Safety Officer can decide");
  });
});

