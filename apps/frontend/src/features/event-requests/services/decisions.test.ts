import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({ supabase: { from: fromMock } }));
vi.mock("@/lib/api-client", () => ({ apiFetch: apiFetchMock }));

import { decideEvent, listEventDecisions } from "./decisions";

beforeEach(() => {
  fromMock.mockReset();
  apiFetchMock.mockReset();
});

describe("listEventDecisions", () => {
  // SPM-7 AC05: each decision keeps the coordinator, outcome, time and any reason.
  it("SPM-7 AC05: reads the event's decisions oldest first, with who decided, when and why", async () => {
    const query = queryBuilder({
      data: [
        {
          id: "decision-1",
          decision: "rejected",
          rationale: "Budget not approved",
          decided_at: "2099-01-01T02:00:00.000Z",
          decided_by: { full_name: "Joyce Coordinator" },
        },
      ],
      error: null,
    });
    fromMock.mockReturnValue(query);

    await expect(listEventDecisions("event-1")).resolves.toEqual([
      {
        id: "decision-1",
        decision: "rejected",
        rationale: "Budget not approved",
        decidedAt: "2099-01-01T02:00:00.000Z",
        decidedByName: "Joyce Coordinator",
      },
    ]);
    expect(fromMock).toHaveBeenCalledWith("event_decisions");
    expect(query.eq).toHaveBeenCalledWith("event_id", "event-1");
    expect(query.order).toHaveBeenCalledWith("decided_at", { ascending: true });
  });

  it("leaves the name blank when the decider's profile can't be read", async () => {
    fromMock.mockReturnValue(
      queryBuilder({
        data: [{ id: "decision-1", decision: "approved", rationale: null, decided_at: "2099-01-01T02:00:00.000Z", decided_by: null }],
        error: null,
      }),
    );

    const [decision] = await listEventDecisions("event-1");

    expect(decision?.decidedByName).toBeNull();
  });

  it("returns an empty list when there are no decisions", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: null }));

    await expect(listEventDecisions("event-1")).resolves.toEqual([]);
  });

  it("gives a readable message when the history can't be loaded", async () => {
    fromMock.mockReturnValue(queryBuilder({ data: null, error: { message: "permission denied" } }));

    await expect(listEventDecisions("event-1")).rejects.toThrow("This event's decision history is unavailable.");
  });
});

describe("decideEvent", () => {
  // SPM-7 AC02 + AC04: the outcome and its reason go to the backend, which records and notifies.
  it("SPM-7 AC04: sends the outcome and reason to the event's decide route", async () => {
    apiFetchMock.mockResolvedValue({ data: { status: "rejected" } });

    await expect(decideEvent("event-1", "rejected", "Budget not approved")).resolves.toEqual({
      data: { status: "rejected" },
    });
    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/decide", {
      method: "POST",
      body: JSON.stringify({ decision: "rejected", rationale: "Budget not approved" }),
    });
  });

  it("lets the backend's refusal reach the page", async () => {
    apiFetchMock.mockRejectedValue(new Error("Only the assigned coordinator can decide this event request"));

    await expect(decideEvent("event-1", "approved", "")).rejects.toThrow(
      "Only the assigned coordinator can decide this event request",
    );
  });
});
