// SPM-40: Configure Event Registration. AC tags refer to that story.
import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { loadMainVenueCapacity, saveRegistrationSettings } from "./registration-settings";

const savedRow = {
  event_id: "event-1",
  registration_required: true,
  registration_opens_at: "2099-01-01T01:00:00.000Z",
  registration_closes_at: "2099-01-10T10:00:00.000Z",
  attendee_capacity: 120,
  waitlist_enabled: true,
  withdrawal_permitted: false,
};

describe("saveRegistrationSettings", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  // AC03: all five settings are sent, times converted from Singapore local.
  it("sends every setting with Singapore times as ISO", async () => {
    rpcMock.mockResolvedValue({ data: savedRow, error: null });

    const saved = await saveRegistrationSettings("event-1", {
      required: true,
      opensAt: "2099-01-01T09:00",
      closesAt: "2099-01-10T18:00",
      capacity: " 120 ",
      waitlistEnabled: true,
      withdrawalPermitted: false,
    });

    expect(rpcMock).toHaveBeenCalledWith("configure_event_registration", {
      p_event_id: "event-1",
      p_settings: {
        required: true,
        opensAt: "2099-01-01T01:00:00.000Z",
        closesAt: "2099-01-10T10:00:00.000Z",
        capacity: "120",
        waitlistEnabled: true,
        withdrawalPermitted: false,
      },
    });
    expect(saved).toEqual({
      required: true,
      opensAt: "2099-01-01T01:00:00.000Z",
      closesAt: "2099-01-10T10:00:00.000Z",
      capacity: 120,
      waitlistEnabled: true,
      withdrawalPermitted: false,
    });
  });

  // AC05: turning registration off sends nothing else.
  it("sends only required: false when registration is off", async () => {
    rpcMock.mockResolvedValue({
      data: { ...savedRow, registration_required: false, registration_opens_at: null },
      error: null,
    });

    await saveRegistrationSettings("event-1", {
      required: false,
      opensAt: "",
      closesAt: "",
      capacity: "",
      waitlistEnabled: false,
      withdrawalPermitted: false,
    });

    expect(rpcMock).toHaveBeenCalledWith("configure_event_registration", {
      p_event_id: "event-1",
      p_settings: { required: false },
    });
  });

  // AC05/AC07: the database's reason is shown to the organiser.
  it("surfaces the database's message when the save is refused", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: "Registration settings can only be changed while the event is in Planning" },
    });

    await expect(
      saveRegistrationSettings("event-1", {
        required: false,
        opensAt: "",
        closesAt: "",
        capacity: "",
        waitlistEnabled: false,
        withdrawalPermitted: false,
      }),
    ).rejects.toThrow("Registration settings can only be changed while the event is in Planning");
  });
});

describe("loadMainVenueCapacity", () => {
  beforeEach(() => {
    rpcMock.mockReset();
  });

  // AC08
  it("returns the approved main venue's capacity, or null without one", async () => {
    rpcMock.mockResolvedValueOnce({ data: 200, error: null });
    await expect(loadMainVenueCapacity("event-1")).resolves.toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("event_main_venue_capacity", { p_event_id: "event-1" });

    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    await expect(loadMainVenueCapacity("event-1")).resolves.toBeNull();
  });
});
