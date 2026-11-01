import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase-client", () => ({ supabase: { rpc: rpcMock } }));

import { listPublicEvents } from "./public-events";

const NOW = new Date("2099-06-01T00:00:00Z");

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "event-1",
  title: "AI Summit",
  starts_at: "2099-07-01T02:00:00Z",
  ends_at: "2099-07-01T06:00:00Z",
  location: "Auditorium",
  banner_path: "org-1/summit.png",
  registration_required: true,
  registration_opens_at: null,
  registration_closes_at: null,
  is_full: false,
  ...overrides,
});

beforeEach(() => {
  rpcMock.mockReset();
});

describe("listPublicEvents", () => {
  it("loads the next six upcoming events with what the public page shows", async () => {
    rpcMock.mockResolvedValue({ data: [row()], error: null });

    await expect(listPublicEvents(6, NOW)).resolves.toEqual([
      {
        id: "event-1",
        title: "AI Summit",
        startsAt: "2099-07-01T02:00:00Z",
        endsAt: "2099-07-01T06:00:00Z",
        location: "Auditorium",
        bannerPath: "org-1/summit.png",
        opensAt: null,
        registration: "open",
      },
    ]);
    expect(rpcMock).toHaveBeenCalledWith("list_public_events", { p_limit: 6 });
  });

  it.each([
    ["not_open", { registration_opens_at: "2099-06-10T00:00:00Z" }],
    ["closed", { registration_closes_at: "2099-05-01T00:00:00Z" }],
    ["full", { is_full: true }],
    ["open", { registration_opens_at: "2099-05-01T00:00:00Z", registration_closes_at: "2099-06-30T00:00:00Z" }],
    // An event that doesn't take registrations is still listed.
    ["not_required", { registration_required: false }],
    // A Confirmed event back under review: venue to be confirmed.
    ["being_updated", { being_updated: true }],
  ])("works out registration as %s", async (state, overrides) => {
    rpcMock.mockResolvedValue({ data: [row(overrides)], error: null });

    const [event] = await listPublicEvents(6, NOW);

    expect(event?.registration).toBe(state);
  });

  it("throws a readable error when events can't be loaded", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(listPublicEvents()).rejects.toThrow("We couldn't load upcoming events.");
  });
});
