import { describe, expect, it } from "vitest";

import type { VenueBookingRequestSummary } from "@/features/venues/services/venue-bookings";

import { awaitsDecision, groupVenueRequests, venueRequestItemMatches } from "./group-venue-requests";

function request(overrides: Partial<VenueBookingRequestSummary> = {}): VenueBookingRequestSummary {
  return {
    id: "b-1",
    status: "approved",
    startsAt: "2099-04-06T02:00:00.000Z",
    endsAt: "2099-04-06T04:00:00.000Z",
    requestedAt: "2099-04-01T00:00:00.000Z",
    decidedAt: null,
    decisionNotes: null,
    expiresAt: null,
    venueId: "v-1",
    venueName: "Auditorium",
    venueLayouts: [],
    eventId: "e-1",
    eventTitle: "Career Fair",
    eventExpectedAttendance: 50,
    requestedByName: "Priya Coordinator",
    decidedByName: null,
    replacesBookingId: null,
    replacesVenueName: null,
    advisoryNotes: null,
    ...overrides,
  };
}

describe("groupVenueRequests", () => {
  // SPM-82: a disrupted booking and its replacement read as one item.
  it("groups a replacement with the booking it replaces", () => {
    const original = request({ id: "orig" });
    const replacement = request({ id: "repl", venueName: "Grand Hall", status: "pending", replacesBookingId: "orig", requestedAt: "2099-04-02T00:00:00.000Z" });

    const items = groupVenueRequests([original, replacement]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "replacement", needsDecision: true });
    const item = items[0]!;
    if (item.kind !== "replacement") throw new Error("expected a replacement group");
    expect(item.original.id).toBe("orig");
    expect(item.current.id).toBe("repl");
    expect(item.earlier).toEqual([]);
  });

  it("keeps an ordinary request on its own", () => {
    const items = groupVenueRequests([request({ id: "a", status: "pending" }), request({ id: "b", eventId: "e-2", eventTitle: "Talk" })]);

    expect(items.map((item) => item.kind)).toEqual(["single", "single"]);
    expect(items.map((item) => item.key).sort()).toEqual(["a", "b"]);
  });

  it("shows the attempt awaiting a decision and keeps earlier attempts as history", () => {
    const original = request({ id: "orig" });
    const rejected = request({ id: "r1", status: "rejected", replacesBookingId: "orig", requestedAt: "2099-04-02T00:00:00.000Z" });
    const withdrawn = request({ id: "r2", status: "cancelled", replacesBookingId: "orig", requestedAt: "2099-04-03T00:00:00.000Z" });
    const pending = request({ id: "r3", status: "pending", replacesBookingId: "orig", requestedAt: "2099-04-04T00:00:00.000Z" });

    const [item] = groupVenueRequests([original, rejected, withdrawn, pending]);

    if (item?.kind !== "replacement") throw new Error("expected a replacement group");
    expect(item.current.id).toBe("r3");
    expect(item.earlier.map((attempt) => attempt.id)).toEqual(["r2", "r1"]);
    expect(item.needsDecision).toBe(true);
  });

  it("shows the most recent attempt, and no decision needed, once every attempt is decided", () => {
    const [item] = groupVenueRequests([
      request({ id: "orig", status: "cancelled" }),
      request({ id: "r1", status: "rejected", replacesBookingId: "orig", requestedAt: "2099-04-02T00:00:00.000Z" }),
      request({ id: "r2", status: "approved", replacesBookingId: "orig", requestedAt: "2099-04-03T00:00:00.000Z" }),
    ]);

    if (item?.kind !== "replacement") throw new Error("expected a replacement group");
    expect(item.current.id).toBe("r2");
    expect(item.earlier.map((attempt) => attempt.id)).toEqual(["r1"]);
    expect(item.needsDecision).toBe(false);
  });

  it("treats a hold as still needing a decision", () => {
    const [item] = groupVenueRequests([
      request({ id: "orig" }),
      request({ id: "r1", status: "on_hold", replacesBookingId: "orig" }),
    ]);

    expect(item?.needsDecision).toBe(true);
  });

  it("keeps a replacement on its own when its original is not in the list", () => {
    const items = groupVenueRequests([request({ id: "r1", status: "pending", replacesBookingId: "hidden" })]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "single", needsDecision: true });
  });

  it("orders items newest first", () => {
    const items = groupVenueRequests([
      request({ id: "old", eventId: "e-old", requestedAt: "2099-04-01T00:00:00.000Z" }),
      request({ id: "orig", eventId: "e-2", requestedAt: "2099-04-02T00:00:00.000Z" }),
      request({ id: "repl", eventId: "e-2", status: "pending", replacesBookingId: "orig", requestedAt: "2099-04-05T00:00:00.000Z" }),
      request({ id: "mid", eventId: "e-mid", requestedAt: "2099-04-03T00:00:00.000Z" }),
    ]);

    expect(items.map((item) => item.key)).toEqual(["replacement-orig", "mid", "old"]);
  });
});

describe("awaitsDecision", () => {
  it("is true only for pending and on-hold requests", () => {
    expect(awaitsDecision(request({ status: "pending" }))).toBe(true);
    expect(awaitsDecision(request({ status: "on_hold" }))).toBe(true);
    for (const status of ["approved", "rejected", "cancelled", "expired"] as const) {
      expect(awaitsDecision(request({ status }))).toBe(false);
    }
  });
});

describe("venueRequestItemMatches", () => {
  const [group] = groupVenueRequests([
    request({ id: "orig", venueName: "Auditorium" }),
    request({ id: "repl", venueName: "Grand Hall", status: "pending", replacesBookingId: "orig", requestedByName: "Priya" }),
  ]);

  it("matches a group on any venue, the event or the requester", () => {
    expect(venueRequestItemMatches(group!, "")).toBe(true);
    expect(venueRequestItemMatches(group!, "auditorium")).toBe(true);
    expect(venueRequestItemMatches(group!, "GRAND")).toBe(true);
    expect(venueRequestItemMatches(group!, "career")).toBe(true);
    expect(venueRequestItemMatches(group!, "priya")).toBe(true);
    expect(venueRequestItemMatches(group!, "nothing like this")).toBe(false);
  });
});
