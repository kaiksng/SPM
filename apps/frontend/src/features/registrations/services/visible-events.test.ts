import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { loadVisibleEvents } from "./visible-events";

const row = {
  id: "event-1",
  title: "Career Fair",
  description: "Meet employers.",
  starts_at: "2099-01-01T01:00:00Z",
  ends_at: "2099-01-01T05:00:00Z",
  status: "confirmed",
  banner_path: "banners/a.png",
  organiser_name: "Student Life Office",
  preferred_location: "Auditorium",
  registration_required: true,
  registration_opens_at: "2098-12-01T00:00:00Z",
  registration_closes_at: "2098-12-30T00:00:00Z",
  attendee_capacity: 40,
  waitlist_enabled: true,
  withdrawal_permitted: true,
};

describe("loadVisibleEvents", () => {
  beforeEach(() => rpcMock.mockReset());

  it("maps the RPC's published fields", async () => {
    rpcMock.mockResolvedValue({ data: [row], error: null });

    await expect(loadVisibleEvents(["event-1"])).resolves.toEqual([
      {
        id: "event-1",
        title: "Career Fair",
        description: "Meet employers.",
        startsAt: "2099-01-01T01:00:00Z",
        endsAt: "2099-01-01T05:00:00Z",
        status: "confirmed",
        bannerPath: "banners/a.png",
        organiserName: "Student Life Office",
        preferredLocation: "Auditorium",
        registrationRequired: true,
        registrationOpensAt: "2098-12-01T00:00:00Z",
        registrationClosesAt: "2098-12-30T00:00:00Z",
        attendeeCapacity: 40,
        waitlistEnabled: true,
        withdrawalPermitted: true,
      },
    ]);
    expect(rpcMock).toHaveBeenCalledWith("attendee_visible_events", { p_event_ids: ["event-1"] });
  });

  it("turns missing optional fields into null", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          ...row,
          description: null,
          starts_at: null,
          ends_at: null,
          banner_path: null,
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

    const [event] = await loadVisibleEvents();

    expect(event).toMatchObject({ description: null, startsAt: null, registrationRequired: null, attendeeCapacity: null });
    expect(rpcMock).toHaveBeenCalledWith("attendee_visible_events", { p_event_ids: undefined });
  });

  it("throws a friendly error when the RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(loadVisibleEvents()).rejects.toThrow("We couldn't load events.");
  });
});
