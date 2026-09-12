import {
  emptyEventRequestFormValues,
  type EventRequestFormValues,
} from "@spm/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { saveEventDraftMock, apiFetchMock } = vi.hoisted(() => ({
  saveEventDraftMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/features/event-requests/services/event-drafts", () => ({
  saveEventDraft: saveEventDraftMock,
}));

vi.mock("@/lib/api-client", () => ({
  ApiError: class ApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public fields?: Array<{ field: string; message: string }>,
    ) {
      super(message);
    }
  },
  apiFetch: apiFetchMock,
}));

import { submitEventRequest } from "./event-submissions";

function completeValues(
  overrides: Partial<EventRequestFormValues> = {},
): EventRequestFormValues {
  return {
    ...emptyEventRequestFormValues,
    venue: {
      ...emptyEventRequestFormValues.venue,
      preferredLocation: "Seminar Room",
    },
    registration: { ...emptyEventRequestFormValues.registration },
    equipment: [],
    title: "Complete request",
    purpose: "Welcome new students",
    description: "A briefing for the incoming cohort.",
    expectedAttendance: "120",
    startsAt: "2099-01-01T10:00",
    endsAt: "2099-01-01T12:00",
    requirementsAcknowledged: true,
    ...overrides,
  };
}

describe("submitEventRequest", () => {
  beforeEach(() => {
    saveEventDraftMock.mockReset().mockResolvedValue("event-1");
    apiFetchMock.mockReset().mockResolvedValue({ data: { status: "requested" } });
  });

  // Regression test: public.submit_event_request only reads the row already
  // in Postgres — it is never sent the browser's current form values. A
  // submission that skips persisting first re-validates stale data and is
  // rejected even when the on-screen form looks complete.
  it("persists the current form values before calling the submit route", async () => {
    const values = completeValues();

    await submitEventRequest("event-1", values);

    expect(saveEventDraftMock).toHaveBeenCalledWith(values, "event-1");
    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/submit", {
      method: "POST",
    });

    const [saveOrder] = saveEventDraftMock.mock.invocationCallOrder;
    const [submitOrder] = apiFetchMock.mock.invocationCallOrder;
    expect(saveOrder).toBeDefined();
    expect(submitOrder).toBeDefined();
    expect(saveOrder!).toBeLessThan(submitOrder!);
  });

  it("does not persist or call the network when local validation fails", async () => {
    await expect(
      submitEventRequest("event-1", completeValues({ purpose: "" })),
    ).rejects.toThrow("Check the highlighted fields and try again.");

    expect(saveEventDraftMock).not.toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});
