import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { loadAttendeeEventDetail } from "./attendee-event";

const row = {
  id: "event-1",
  title: "AI Innovation Summit",
  description: "A full day of talks.",
  starts_at: "2099-11-12T02:00:00Z",
  ends_at: "2099-11-12T08:00:00Z",
  status: "confirmed",
  banner_path: null,
  organiser_name: "Student Life Office",
  preferred_location: "Auditorium",
  registration_required: true,
  registration_opens_at: null,
  registration_closes_at: "2099-11-10T00:00:00Z",
  attendee_capacity: 50,
  waitlist_enabled: true,
  withdrawal_permitted: false,
};

beforeEach(() => {
  rpcMock.mockReset();
});

describe("loadAttendeeEventDetail", () => {
  it("maps the event's public details and registration settings", async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    await expect(loadAttendeeEventDetail("event-1")).resolves.toEqual({
      id: "event-1",
      title: "AI Innovation Summit",
      description: "A full day of talks.",
      startsAt: "2099-11-12T02:00:00Z",
      endsAt: "2099-11-12T08:00:00Z",
      status: "confirmed",
      organiserName: "Student Life Office",
      bannerPath: null,
      venue: { preferredLocation: "Auditorium" },
      registration: {
        required: true,
        opensAt: null,
        closesAt: "2099-11-10T00:00:00Z",
        capacity: 50,
        waitlistEnabled: true,
        withdrawalPermitted: false,
      },
    });
    expect(rpcMock).toHaveBeenCalledWith("attendee_visible_events", { p_event_ids: ["event-1"] });
  });

  // SPM-44 AC05 / SPM-49 AC2: the attendee never reads the events table or any internal field.
  it("reads only through the attendee RPC, never the events table or internal fields", async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    const detail = await loadAttendeeEventDetail("event-1");

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock.mock.calls[0]?.[0]).toBe("attendee_visible_events");
    expect(Object.keys(detail).join(" ")).not.toMatch(/equipment|facilit|notes|purpose|attendance|coordinator/i);
  });

  it("falls back to defaults when the event has no venue or registration rows", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          ...row,
          organiser_name: null,
          preferred_location: null,
          registration_required: null,
          registration_opens_at: null,
          registration_closes_at: null,
          attendee_capacity: null,
          waitlist_enabled: null,
          withdrawal_permitted: null,
        },
      ],
      error: null,
    });

    await expect(loadAttendeeEventDetail("event-1")).resolves.toMatchObject({
      organiserName: null,
      venue: { preferredLocation: null },
      registration: { required: false, capacity: null, waitlistEnabled: false, withdrawalPermitted: false },
    });
  });

  it.each([
    ["no event is visible", { data: [], error: null }],
    ["the read fails", { data: null, error: { message: "boom" } }],
  ])("throws the access message when %s", async (_label, result) => {
    rpcMock.mockResolvedValue(result);

    await expect(loadAttendeeEventDetail("event-1")).rejects.toThrow(
      "This event is unavailable or you do not have access to it.",
    );
  });
});
