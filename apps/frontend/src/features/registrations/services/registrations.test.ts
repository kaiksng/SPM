import { beforeEach, describe, expect, it, vi } from "vitest";

import { queryBuilder } from "@/test/supabase-mock";

const { fromMock, apiFetchMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  apiFetchMock: vi.fn(),
}));

vi.mock("@/lib/supabase-client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("@/lib/api-client", () => ({
  apiFetch: apiFetchMock,
}));

import {
  getOwnRegistrationStatus,
  getRegisteredCount,
  listMyRegistrations,
  registerForEvent,
} from "./registrations";

describe("registerForEvent", () => {
  it("posts to the backend register route", async () => {
    apiFetchMock.mockResolvedValue({ data: { status: "registered" } });

    await registerForEvent("event-1");

    expect(apiFetchMock).toHaveBeenCalledWith("/events/event-1/register", { method: "POST" });
  });
});

describe("getOwnRegistrationStatus", () => {
  beforeEach(() => fromMock.mockReset());

  it("returns the attendee's status when a row exists", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: { status: "registered" }, error: null }));

    await expect(getOwnRegistrationStatus("event-1", "attendee-1")).resolves.toBe("registered");
  });

  it("returns null when the attendee has no registration", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: null }));

    await expect(getOwnRegistrationStatus("event-1", "attendee-1")).resolves.toBeNull();
  });
});

describe("getRegisteredCount", () => {
  beforeEach(() => fromMock.mockReset());

  it("returns the count from the query", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: null, count: 7 } as never));

    await expect(getRegisteredCount("event-1")).resolves.toBe(7);
  });

  it("defaults to 0 when count is null", async () => {
    fromMock.mockReturnValueOnce(queryBuilder({ data: null, error: null, count: null } as never));

    await expect(getRegisteredCount("event-1")).resolves.toBe(0);
  });
});

describe("listMyRegistrations", () => {
  beforeEach(() => fromMock.mockReset());

  it("maps each row's event into a flat registration summary", async () => {
    fromMock.mockReturnValueOnce(
      queryBuilder({
        data: [
          {
            id: "reg-1",
            status: "registered",
            registered_at: "2026-11-01T00:00:00Z",
            event: {
              id: "event-1",
              title: "Robotics Showcase",
              starts_at: "2026-11-28T03:00:00Z",
              ends_at: "2026-11-28T07:00:00Z",
              event_venue_requirements: { preferred_location: "Exhibition Hall" },
            },
          },
        ],
        error: null,
      }),
    );

    await expect(listMyRegistrations()).resolves.toEqual([
      {
        id: "reg-1",
        eventId: "event-1",
        title: "Robotics Showcase",
        startsAt: "2026-11-28T03:00:00Z",
        endsAt: "2026-11-28T07:00:00Z",
        location: "Exhibition Hall",
        status: "registered",
        registeredAt: "2026-11-01T00:00:00Z",
      },
    ]);
  });

  it("skips a row whose event is no longer visible", async () => {
    fromMock.mockReturnValueOnce(
      queryBuilder({
        data: [{ id: "reg-1", status: "registered", registered_at: "2026-11-01T00:00:00Z", event: null }],
        error: null,
      }),
    );

    await expect(listMyRegistrations()).resolves.toEqual([]);
  });
});
