import { beforeEach, describe, expect, it, vi } from "vitest";

const { apiFetchMock } = vi.hoisted(() => ({ apiFetchMock: vi.fn() }));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import { cancelEvent } from "./event-cancellation";

describe("cancelEvent", () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  // SPM-45 AC4: cancelling posts the reason to the cancellation route.
  it("posts the reason to the event's cancel route", async () => {
    apiFetchMock.mockResolvedValue({ data: { status: "cancelled" } });

    await cancelEvent("event-1", "The venue is no longer available.");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/cancel", {
      method: "POST",
      body: JSON.stringify({ reason: "The venue is no longer available." }),
    });
  });

  it("surfaces an error from the backend without swallowing it", async () => {
    apiFetchMock.mockRejectedValue(new Error("Only the assigned coordinator can cancel this event"));

    await expect(cancelEvent("event-1", "Not my event.")).rejects.toThrow(
      "Only the assigned coordinator can cancel this event",
    );
  });
});
