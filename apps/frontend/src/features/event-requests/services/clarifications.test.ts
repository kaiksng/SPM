import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));

import { listClarifications } from "./clarifications";

beforeEach(() => {
  fromMock.mockReset();
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
