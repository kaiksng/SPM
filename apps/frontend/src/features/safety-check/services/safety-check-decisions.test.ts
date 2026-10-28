import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }));

import { listPendingSafetyCheckEvents } from "./safety-check-decisions";

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
});
