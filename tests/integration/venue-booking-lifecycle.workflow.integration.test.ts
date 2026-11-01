import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventRequestFormValues } from "@spm/shared";
import { listNotifications } from "@/features/notifications/services/notifications";
import { createVenueBlock } from "@/features/venues/services/venue-blocks";
import { listVenueDisruptionsForCoordinator } from "@/features/venues/services/venue-disruptions";
import {
  confirmVenueBookingHold, decideVenueBookingRequest, listVenueBookingsForEvent, placeVenueBookingHold,
  requestReplacementVenue, setMainVenueBooking, submitVenueBookingRequest, withdrawVenueBookingRequest,
} from "@/features/venues/services/venue-bookings";
import { listSuggestedVenues } from "@/features/venues/services/venues";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";
import { createActors, eventSnapshot, notificationRecipients, planningEvent } from "./support/workflow";

// Workflow 2: venue booking lifecycle for a Planning event. Suggestions (SPM-72),
// request (SPM-24), conflict refusal (SPM-26), staff decision (SPM-25), holds
// (SPM-78/75), additional venues (SPM-85) and replacement (SPM-82). Manual
// search, buffered availability and block/disruption flagging have their own
// suites (SPM-21, SPM-87, SPM-83); blocks here are only a setup step.

let fixture: IntegrationFixture;
let actors: Awaited<ReturnType<typeof createActors>>;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  actors = await createActors(fixture);
  staff = await fixture.user("venue_staff");
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

// The fixture venue's area tag; requesting it makes the venue a mandatory match.
const AREA: Partial<EventRequestFormValues> = {
  venue: { preferredLocation: "Central Area", minimumCapacity: "30", accessibilityNotes: "", layoutNotes: "", facilities: [] },
};

function planning(title: string, overrides: Partial<EventRequestFormValues> = {}, coordinator = actors.coordinatorA) {
  return planningEvent(fixture, { organiser: actors.organiser, lead: actors.lead, coordinator }, title, { ...AREA, ...overrides });
}

async function bookings(eventId: string) {
  return (await database.query(
    `select b.status, b.label, b.is_main_venue, b.venue_id, b.replaces_booking_id, b.decided_by, b.decision_notes,
            b.cancellation_reason, b.expected_headcount, b.id
     from public.venue_bookings b where b.event_id = $1 order by b.requested_at, b.id`, [eventId])).rows;
}

async function activeBookingCount(venueId: string) {
  return (await database.query(
    "select count(*)::int as n from public.venue_bookings where venue_id = $1 and status in ('pending','approved','on_hold')", [venueId])).rows[0].n as number;
}

describe("Workflow: venue booking lifecycle", () => {
  // SPM-72 AC1/AC2, SPM-24 AC1/AC5/AC6: suggestions without filters, then a real request.
  it("suggests only matching venues and turns a request into a Pending booking staff are told about", async () => {
    const venueId = await fixture.venue(100);
    const { id } = await planning("Integration venue request");
    const tooBig = await planning("Integration oversized event", { expectedAttendance: "500" });

    const listed = await listSuggestedVenues(id);
    expect(listed.find((venue) => venue.id === venueId)).toMatchObject({ availabilityStatus: "available", capacity: 100 });
    // Mandatory attendance: a venue below it is not suggested, so the panel would show "No matching venues".
    expect((await listSuggestedVenues(tooBig.id)).map((venue) => venue.id)).not.toContain(venueId);

    const bookingId = await submitVenueBookingRequest(id, venueId);
    const [row] = await bookings(id);
    expect(row).toMatchObject({ id: bookingId, status: "pending", label: "Main Programme", is_main_venue: true, expected_headcount: 30, venue_id: venueId });
    // SPM-24 AC5: the booking carries the event's own period and requirements.
    expect((await database.query(
      "select b.starts_at = e.starts_at and b.ends_at = e.ends_at as same_period from public.venue_bookings b join public.events e on e.id = b.event_id where b.id = $1", [bookingId])).rows[0])
      .toEqual({ same_period: true });
    expect((await listSuggestedVenues(id)).find((venue) => venue.id === venueId)).toMatchObject({ availabilityStatus: "pending" });
    expect(await notificationRecipients(id, "venue_request")).toContain(staff.id);
  });

  // SPM-24 AC2, SPM-26 AC1-AC4: refusal creates no record; touching periods are fine; simultaneous requests.
  it("refuses overlapping and blocked requests without creating a record, allows touching periods, and survives a race", async () => {
    const venueId = await fixture.venue(100);
    const first = await planning("Integration booked event");
    const overlapping = await planning("Integration overlapping event");
    const touching = await planning("Integration touching event", { startsAt: "2099-05-04T12:00", endsAt: "2099-05-04T14:00" });
    const blocked = await planning("Integration blocked event", { startsAt: "2099-05-05T10:00", endsAt: "2099-05-05T12:00" });
    await submitVenueBookingRequest(first.id, venueId);

    // AC1/S1: same period as a Pending booking.
    const before = await eventSnapshot(overlapping.id);
    await expect(submitVenueBookingRequest(overlapping.id, venueId)).rejects.toThrow(/already occupied/i);
    expect(await bookings(overlapping.id)).toEqual([]);
    expect(await eventSnapshot(overlapping.id)).toEqual(before);

    // AC3: one period ends exactly when the other begins, so no conflict.
    await submitVenueBookingRequest(touching.id, venueId);
    expect(await bookings(touching.id)).toEqual([expect.objectContaining({ status: "pending" })]);

    // AC2: an active operational block refuses the request.
    await fixture.signIn(staff);
    await createVenueBlock({ venueId, reasonCategory: "maintenance", reason: "Integration repair", startsAt: "2099-05-05T09:00", endsAt: "2099-05-05T13:00" });
    await fixture.signIn(actors.coordinatorA);
    await expect(submitVenueBookingRequest(blocked.id, venueId)).rejects.toThrow(/unavailable/i);
    expect(await bookings(blocked.id)).toEqual([]);

    // AC4: two coordinators request the same free period at once; exactly one commitment results.
    const raceVenue = await fixture.venue(100);
    const slot = { startsAt: "2099-06-01T10:00", endsAt: "2099-06-01T12:00" };
    const left = await planning("Integration race left", slot);
    const right = await planning("Integration race right", slot, actors.coordinatorB);
    vi.resetModules();
    const secondClient = (await import("@/lib/supabase-client")).supabase;
    const secondService = await import("@/features/venues/services/venue-bookings");
    try {
      await fixture.signIn(actors.coordinatorA);
      const { error } = await secondClient.auth.signInWithPassword(actors.coordinatorB);
      if (error) throw new Error("Could not sign in the second coordinator.");
      const results = await Promise.allSettled([
        submitVenueBookingRequest(left.id, raceVenue),
        secondService.submitVenueBookingRequest(right.id, raceVenue),
      ]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(await activeBookingCount(raceVenue)).toBe(1);
      expect((await bookings(left.id)).length + (await bookings(right.id)).length).toBe(1);
    } finally {
      await secondClient.auth.signOut();
      secondClient.auth.stopAutoRefresh();
    }
  });

  // SPM-25: staff decide; the record and the coordinator's notice.
  it("lets only Venue Staff decide, requires a reason to reject, releases the period and records the outcome", async () => {
    const venueId = await fixture.venue(100);
    const first = await planning("Integration decided event");
    const second = await planning("Integration next event");
    const firstBooking = await submitVenueBookingRequest(first.id, venueId);

    await fixture.signIn(actors.coordinatorA);
    const before = await eventSnapshot(first.id);
    await expect(decideVenueBookingRequest(firstBooking, "approved", "")).rejects.toThrow(/Venue Staff/);
    expect(await eventSnapshot(first.id)).toEqual(before);

    await fixture.signIn(staff);
    await expect(decideVenueBookingRequest(firstBooking, "rejected", "   ")).rejects.toThrow(/reason/i);
    expect(await eventSnapshot(first.id)).toEqual(before);
    await decideVenueBookingRequest(firstBooking, "rejected", "Under renovation");
    expect((await bookings(first.id))[0]).toMatchObject({ status: "rejected", decided_by: staff.id, decision_notes: "Under renovation" });
    expect((await database.query("select decided_at is not null as timed from public.venue_bookings where id = $1", [firstBooking])).rows[0]).toEqual({ timed: true });
    expect(await notificationRecipients(first.id, "venue_decision")).toEqual([actors.coordinatorA.id]);

    // The rejected period is released: another event can now take it, and staff approve it.
    await fixture.signIn(actors.coordinatorA);
    const secondBooking = await submitVenueBookingRequest(second.id, venueId);
    await fixture.signIn(staff);
    await decideVenueBookingRequest(secondBooking, "approved", "");
    expect((await bookings(second.id))[0]).toMatchObject({ status: "approved", decided_by: staff.id });
    await expect(decideVenueBookingRequest(secondBooking, "rejected", "Too late")).rejects.toThrow(/Pending/);
    await fixture.signIn(actors.coordinatorA);
    expect((await listNotifications()).filter((n) => n.eventId === second.id && n.type === "venue_decision")).toHaveLength(1);
    expect((await listSuggestedVenues(first.id)).find((venue) => venue.id === venueId)).toMatchObject({ availabilityStatus: "confirmed" });
  });

  // SPM-78 AC1-AC3, SPM-75 AC2-AC5, SPM-24 AC2 (On Hold): hold, confirm and expiry.
  it("places a hold, lets the requesting coordinator confirm it, and releases an expired hold while keeping its history", async () => {
    const venueId = await fixture.venue(100);
    const held = await planning("Integration held event");
    const rival = await planning("Integration rival event");
    const booking = await submitVenueBookingRequest(held.id, venueId);

    await fixture.signIn(actors.coordinatorA);
    const inTwelveHours = new Date(Date.now() + 12 * 3_600_000).toISOString();
    await expect(placeVenueBookingHold(booking, inTwelveHours)).rejects.toThrow(/Venue Staff/);
    await fixture.signIn(staff);
    await expect(placeVenueBookingHold(booking, new Date(Date.now() - 3_600_000).toISOString())).rejects.toThrow(/future/i);
    await expect(placeVenueBookingHold(booking, "2099-05-04T05:00:00Z")).rejects.toThrow(/before/i);
    expect((await bookings(held.id))[0].status).toBe("pending");

    await placeVenueBookingHold(booking, inTwelveHours);
    expect((await bookings(held.id))[0]).toMatchObject({ status: "on_hold" });
    // SPM-24 AC2: an On Hold period refuses another request.
    await fixture.signIn(actors.coordinatorA);
    await expect(submitVenueBookingRequest(rival.id, venueId)).rejects.toThrow(/already occupied/i);
    // SPM-75 AC5: under 24 hours left, the requesting coordinator has an expiry-soon notice.
    expect((await listNotifications()).filter((n) => n.eventId === held.id && n.type === "venue_hold_expiring_soon")).toHaveLength(1);

    // SPM-75 AC2: only the requesting coordinator confirms; the booking returns to Pending.
    await fixture.signIn(actors.coordinatorB);
    await expect(confirmVenueBookingHold(booking)).rejects.toThrow(/coordinator who submitted/i);
    await fixture.signIn(actors.coordinatorA);
    await confirmVenueBookingHold(booking);
    expect((await bookings(held.id))[0].status).toBe("pending");

    // SPM-75 AC3/AC4: a hold past its deadline is released and stays in history.
    // Setup only: the deadline is moved into the past, since a real wait is impossible.
    await fixture.signIn(staff);
    await placeVenueBookingHold(booking, inTwelveHours);
    await database.query("update public.venue_bookings set expires_at = now() - interval '1 hour' where id = $1", [booking]);
    await fixture.signIn(actors.coordinatorA);
    await expect(confirmVenueBookingHold(booking)).rejects.toThrow(/expired/i);
    const rivalBooking = await submitVenueBookingRequest(rival.id, venueId);
    expect((await bookings(rival.id))[0]).toMatchObject({ id: rivalBooking, status: "pending" });
    expect(await listVenueBookingsForEvent(held.id)).toEqual([expect.objectContaining({ id: booking, status: "expired" })]);
  });

  // SPM-85 AC1-AC4, AC6, AC8, AC9, AC11, AC12 (agreed 12): several independent bookings for one event.
  it("books additional venues independently, keeps one main venue, and releases only the booking withdrawn or cancelled", async () => {
    const hall = await fixture.venue(100);
    const roomA = await fixture.venue(100);
    const small = await fixture.venue(20);
    const { id } = await planning("Integration conference", { expectedAttendance: "60", startsAt: "2099-05-04T10:00", endsAt: "2099-05-04T16:00" });
    const detail = (label: string, from: string, to: string, headcount: number) => ({
      label, startsAt: `2099-05-04T${from}:00+08:00`, endsAt: `2099-05-04T${to}:00+08:00`, expectedHeadcount: headcount,
    });

    const main = await submitVenueBookingRequest(id, hall);
    // AC1/AC3: another venue on an event that already has a Pending booking, within the event's times.
    const breakout1 = await submitVenueBookingRequest(id, roomA, detail("Breakout 1", "10:00", "12:00", 20));
    await expect(submitVenueBookingRequest(id, roomA, detail("Too early", "08:00", "09:00", 10))).rejects.toThrow(/within the event/i);
    // AC4: capacity below this booking's headcount.
    await expect(submitVenueBookingRequest(id, small, detail("Too many", "10:00", "12:00", 40))).rejects.toThrow(/capacity/i);
    // AC6: same venue overlapping is refused; a later, non-overlapping period is allowed.
    await expect(submitVenueBookingRequest(id, roomA, detail("Overlap", "11:00", "13:00", 20))).rejects.toThrow(/already has an active booking or hold for this venue/i);
    const breakout2 = await submitVenueBookingRequest(id, roomA, detail("Breakout 2", "13:00", "15:00", 20));
    expect((await bookings(id)).map((row) => [row.label, row.status, row.is_main_venue])).toEqual([
      ["Main Programme", "pending", true], ["Breakout 1", "pending", false], ["Breakout 2", "pending", false],
    ]);

    // AC8: staff decide each request on its own.
    await fixture.signIn(staff);
    await decideVenueBookingRequest(breakout1, "approved", "");
    const states = async () => Object.fromEntries((await bookings(id)).map((row) => [row.label, row.status]));
    expect(await states()).toEqual({ "Main Programme": "pending", "Breakout 1": "approved", "Breakout 2": "pending" });

    // AC5: the coordinator moves the main designation; exactly one active booking is main.
    await fixture.signIn(actors.coordinatorB);
    await expect(setMainVenueBooking(breakout1)).rejects.toThrow(/assigned coordinator/i);
    await fixture.signIn(actors.coordinatorA);
    await setMainVenueBooking(breakout1);
    expect((await bookings(id)).filter((row) => row.is_main_venue).map((row) => row.label)).toEqual(["Breakout 1"]);

    // AC11: withdrawing needs a reason, releases only that booking and tells staff.
    await expect(withdrawVenueBookingRequest(breakout2, "  ")).rejects.toThrow(/reason/i);
    await withdrawVenueBookingRequest(breakout2, "Session merged into the hall");
    expect(await states()).toEqual({ "Main Programme": "pending", "Breakout 1": "approved", "Breakout 2": "cancelled" });
    expect((await bookings(id)).find((row) => row.label === "Breakout 2")).toMatchObject({ cancellation_reason: "Session merged into the hall" });
    expect(await notificationRecipients(id, "venue_request_withdrawn")).toContain(staff.id);

    // AC11/AC12: cancelling the Approved main booking leaves the event with no main venue; the rest is untouched.
    await withdrawVenueBookingRequest(breakout1, "Room double-booked by the venue");
    expect(await states()).toEqual({ "Main Programme": "pending", "Breakout 1": "cancelled", "Breakout 2": "cancelled" });
    expect((await bookings(id)).filter((row) => row.is_main_venue && ["pending", "approved"].includes(row.status))).toEqual([]);
    expect(main).toBeTruthy();
    // The released period is free again for this event's same venue.
    await submitVenueBookingRequest(id, roomA, detail("Breakout 1 again", "10:00", "12:00", 20));
  });

  // SPM-82 AC3-AC5, AC8: a replacement for a disrupted booking, approved.
  it("replaces a disrupted booking: one pending replacement, linked, approved, original cancelled, others untouched", async () => {
    const { id, original, other, replacementVenue } = await disruptedBooking();

    // AC3: only the assigned coordinator, only for a Disrupted booking.
    await fixture.signIn(actors.coordinatorB);
    await expect(requestReplacementVenue(original, replacementVenue)).rejects.toThrow(/assigned coordinator/i);
    await fixture.signIn(actors.coordinatorA);
    await expect(requestReplacementVenue(other, replacementVenue)).rejects.toThrow(/not disrupted/i);

    const replacement = await requestReplacementVenue(original, replacementVenue);
    await expect(requestReplacementVenue(original, replacementVenue)).rejects.toThrow(/pending replacement/i);
    // AC4/AC8: a new Pending booking linked to the original, keeping its period and main flag.
    const rows = await bookings(id);
    expect(rows.find((row) => row.id === replacement)).toMatchObject({ status: "pending", replaces_booking_id: original, is_main_venue: true });
    expect(rows.find((row) => row.id === original)).toMatchObject({ status: "approved" });

    // AC5: on approval the original is cancelled; the event's other booking is not affected.
    await fixture.signIn(staff);
    await decideVenueBookingRequest(replacement, "approved", "");
    const after = await bookings(id);
    expect(after.find((row) => row.id === original)).toMatchObject({ status: "cancelled" });
    expect(after.find((row) => row.id === replacement)).toMatchObject({ status: "approved", replaces_booking_id: original });
    expect(after.find((row) => row.id === other)).toMatchObject({ status: "pending" });
    await fixture.signIn(actors.coordinatorA);
    const history = await listVenueBookingsForEvent(id);
    expect(history.find((row) => row.id === replacement)).toMatchObject({ replacesBookingId: original });
  });

  // SPM-82 AC6/AC7: a rejected or withdrawn replacement leaves the original Disrupted.
  it("keeps the original Disrupted when its replacement is rejected or withdrawn, and allows another try", async () => {
    const { original, replacementVenue } = await disruptedBooking();
    const disrupted = async () => (await listVenueDisruptionsForCoordinator()).find((item) => item.bookingId === original);

    await fixture.signIn(actors.coordinatorA);
    const first = await requestReplacementVenue(original, replacementVenue);
    await fixture.signIn(staff);
    await decideVenueBookingRequest(first, "rejected", "Replacement room unavailable");
    await fixture.signIn(actors.coordinatorA);
    expect(await disrupted()).toMatchObject({ state: "replacement_required" });

    const second = await requestReplacementVenue(original, replacementVenue);
    expect(await disrupted()).toMatchObject({ state: "replacement_requested", replacementBookingId: second });
    await withdrawVenueBookingRequest(second, "Found another option");
    expect(await disrupted()).toMatchObject({ state: "replacement_required" });
    expect((await database.query("select status from public.venue_bookings where id = $1", [original])).rows[0]).toEqual({ status: "approved" });
    expect((await database.query("select status from public.venue_bookings where id = $1", [second])).rows[0]).toEqual({ status: "cancelled" });
  });

  // SPM-24, SPM-25, SPM-78, SPM-84 AC7: server-side actor rules, each with a successful control.
  it("restricts requests, withdrawals and replacements to the assigned coordinator and decisions to Venue Staff", async () => {
    const venueId = await fixture.venue(100);
    const { id } = await planning("Integration permissions event");
    const before = await eventSnapshot(id);

    for (const actor of [actors.organiser, actors.coordinatorB]) {
      await fixture.signIn(actor);
      await expect(submitVenueBookingRequest(id, venueId)).rejects.toThrow(/assigned coordinator/i);
      expect(await eventSnapshot(id)).toEqual(before);
    }
    await fixture.signIn(actors.coordinatorA);
    const booking = await submitVenueBookingRequest(id, venueId);
    const requested = await eventSnapshot(id);

    await fixture.signIn(actors.coordinatorB);
    await expect(withdrawVenueBookingRequest(booking, "Not mine")).rejects.toThrow(/assigned coordinator/i);
    await expect(requestReplacementVenue(booking, venueId)).rejects.toThrow(/assigned coordinator/i);
    await fixture.signIn(actors.organiser);
    await expect(decideVenueBookingRequest(booking, "approved", "")).rejects.toThrow(/Venue Staff/);
    expect(await eventSnapshot(id)).toEqual(requested);

    await fixture.signIn(actors.coordinatorA);
    await withdrawVenueBookingRequest(booking, "Changed plan");
    expect((await bookings(id))[0]).toMatchObject({ status: "cancelled", cancellation_reason: "Changed plan" });
  });

  /** An event with an Approved main booking on a blocked venue (Disrupted) and a second, undisturbed Pending booking. */
  async function disruptedBooking() {
    const venue = await fixture.venue(100);
    const replacementVenue = await fixture.venue(100);
    const spare = await fixture.venue(100);
    const { id } = await planning("Integration disrupted event", { expectedAttendance: "60", startsAt: "2099-05-04T10:00", endsAt: "2099-05-04T16:00" });
    const original = await submitVenueBookingRequest(id, venue);
    const other = await submitVenueBookingRequest(id, spare, {
      label: "Breakout 1", startsAt: "2099-05-04T12:00:00+08:00", endsAt: "2099-05-04T14:00:00+08:00", expectedHeadcount: 20,
    });
    await fixture.signIn(staff);
    await decideVenueBookingRequest(original, "approved", "");
    await createVenueBlock({ venueId: venue, reasonCategory: "maintenance", reason: "Integration repair", startsAt: "2099-05-04T09:00", endsAt: "2099-05-04T17:00" });
    await fixture.signIn(actors.coordinatorA);
    expect((await listVenueDisruptionsForCoordinator()).find((item) => item.bookingId === original)).toMatchObject({ state: "replacement_required" });
    return { id, original, other, replacementVenue };
  }
});
