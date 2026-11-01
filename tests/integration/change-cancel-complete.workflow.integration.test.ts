import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assignEventCoordinator } from "@/features/event-requests/services/all-events";
import { requestClarification } from "@/features/event-requests/services/clarifications";
import { decideEvent, listEventDecisions } from "@/features/event-requests/services/decisions";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { cancelEvent } from "@/features/event-requests/services/event-cancellation";
import { loadEventForChangeApply, updateEventAsCoordinator } from "@/features/event-requests/services/coordinator-event-edit";
import {
  applyEventChangeRequest, decideEventChangeRequest, hasPendingChangeRequest, listEventChangeRequests,
  submitEventChangeRequest, withdrawEventChangeRequest,
} from "@/features/event-requests/services/change-requests";
import { completeEvent, listEventStatusHistory, loadEventCompletionAvailableAt } from "@/features/event-requests/services/event-lifecycle";
import { listNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "@/features/notifications/services/notifications";
import { submitEventForSafetyCheck } from "@/features/safety-check/services/event-readiness";
import { listSafetyCheckDecisions } from "@/features/safety-check/services/safety-check-decisions";
import { saveVenueSafetyChecks } from "@/features/safety-check/services/safety-plan";
import {
  decideVenueBookingRequest, listVenueBookingsForEvent, placeVenueBookingHold, submitVenueBookingRequest,
} from "@/features/venues/services/venue-bookings";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";
import {
  AREA_VENUE, BREAKOUT, createActors, DEFAULT_WINDOW, confirmedEvent, eventSnapshot, notificationRecipients, planningEvent,
  SAFETY_CHECKS, submitRequestedEvent,
} from "./support/workflow";

// Workflow 5: change, cancel, complete. Organiser change requests and their
// ripple into arrangements (SPM-38/39), whole-event cancellation (SPM-45),
// completion (SPM-46) and the notification centre (SPM-76). Releasing
// equipment reservations and notifying registered attendees are asserted in
// workflows 3 and 6, which build that setup. Booking-level cancellation is in
// workflow 2.

let fixture: IntegrationFixture;
let actors: Awaited<ReturnType<typeof createActors>>;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let officer: Awaited<ReturnType<IntegrationFixture["user"]>>;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  actors = await createActors(fixture);
  staff = await fixture.user("venue_staff");
  officer = await fixture.user("safety_officer");
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

const cast = () => ({ organiser: actors.organiser, lead: actors.lead, coordinator: actors.coordinatorA, staff, officer });
const planning = (title: string, overrides = {}) =>
  planningEvent(fixture, cast(), title, { ...AREA_VENUE, ...DEFAULT_WINDOW, ...overrides });
const confirmed = (title: string, options = {}) => confirmedEvent(fixture, cast(), title, options);

async function eventRow(id: string) {
  return (await database.query("select status, title, description, starts_at, ends_at, assigned_coordinator_id from public.events where id = $1", [id])).rows[0];
}
async function bookingRows(id: string) {
  return (await database.query(
    "select id, status, needs_review, needs_review_reason, cancellation_reason, cancelled_by, cancelled_at from public.venue_bookings where event_id = $1 order by requested_at, id", [id])).rows;
}
async function notificationCount(id: string, type: string) {
  return (await database.query("select count(*)::int as n from public.notifications where event_id = $1 and type = $2::public.notification_type", [id, type])).rows[0].n as number;
}

/** The organiser submits, the coordinator approves with notes, ready for the coordinator to apply. */
async function approvedChange(eventId: string, description = "Move the programme") {
  await fixture.signIn(actors.organiser);
  const { data } = await submitEventChangeRequest(eventId, { description }, "The sponsor needs a later date");
  await fixture.signIn(actors.coordinatorA);
  await decideEventChangeRequest(data.id, "approved", "Re-check the venue before applying");
  return data.id as string;
}

describe("Workflow: change, cancel, complete", () => {
  // SPM-38 AC1, AC3-AC5, AC8 and SPM-39 AC4-AC6: submit, withdraw and decide.
  it("records a change request, keeps arrangements active, and lets only the right people withdraw or decide", async () => {
    const { id } = await planning("Integration change request event");
    const stranger = await fixture.organiser();
    const before = await eventRow(id);

    await fixture.signIn(stranger);
    await expect(submitEventChangeRequest(id, { description: "Not mine" }, "Reason")).rejects.toThrow(/Only the event organiser/);
    await fixture.signIn(actors.organiser);
    await expect(submitEventChangeRequest(id, { description: "Later start" }, "  ")).rejects.toThrow();
    const { data: first } = await submitEventChangeRequest(id, { description: "Later start" }, "Venue opens later");
    expect(first.status).toBe("pending");
    await expect(submitEventChangeRequest(id, { description: "Another" }, "Reason")).rejects.toThrow(/already has a change request pending/i);
    expect(await hasPendingChangeRequest(id)).toBe(true);
    // The coordinator is told; the agreed event details stay as they were while Pending Review.
    expect(await notificationRecipients(id, "event_change")).toEqual([actors.coordinatorA.id]);
    expect(await eventRow(id)).toEqual(before);

    // Only the submitting organiser can withdraw, and only before a decision.
    await fixture.signIn(actors.coordinatorA);
    await expect(withdrawEventChangeRequest(first.id)).rejects.toThrow(/organiser who submitted/i);
    await fixture.signIn(actors.organiser);
    await withdrawEventChangeRequest(first.id);
    expect(await hasPendingChangeRequest(id)).toBe(false);
    await expect(withdrawEventChangeRequest(first.id)).rejects.toThrow(/Pending Review/);

    // Deciding: only the assigned coordinator; approval needs notes, rejection a reason.
    const { data: second } = await submitEventChangeRequest(id, { description: "Earlier start" }, "Sponsor request");
    for (const actor of [actors.coordinatorB, actors.organiser]) {
      await fixture.signIn(actor);
      await expect(decideEventChangeRequest(second.id, "approved", "Notes")).rejects.toThrow(/assigned coordinator/i);
    }
    await fixture.signIn(actors.coordinatorA);
    await expect(decideEventChangeRequest(second.id, "approved", "")).rejects.toThrow();
    await expect(decideEventChangeRequest(second.id, "rejected", "")).rejects.toThrow();
    await decideEventChangeRequest(second.id, "rejected", "Not feasible this quarter");
    expect(await eventRow(id)).toEqual(before);

    await fixture.signIn(actors.organiser);
    const { data: third } = await submitEventChangeRequest(id, { description: "Same day, later" }, "Revised request");
    await fixture.signIn(actors.coordinatorA);
    await decideEventChangeRequest(third.id, "approved", "Apply after checking the venue");
    const history = await listEventChangeRequests(id);
    expect(history.map((request) => [request.status, request.reviewNotes])).toEqual([
      ["withdrawn", null], ["rejected", "Not feasible this quarter"], ["approved", "Apply after checking the venue"],
    ]);
    expect(history[1].reviewedAt).not.toBeNull();
    // SPM-39 AC5/AC6: the organiser is told of each decision; nothing about the event changed.
    expect((await database.query("select count(*)::int as n from public.notifications where event_id = $1 and type = 'event_change' and recipient_id = $2", [id, actors.organiser.id])).rows[0].n).toBe(2);
    expect(await eventRow(id)).toEqual(before);
  });

  // SPM-39 AC1, AC2, AC7-AC11 and SPM-38 AC1 (Confirmed): applying a date change.
  it("applies a date change to a Confirmed event: notifies staff, flags nothing, returns to Planning, never releases a booking", async () => {
    const original = await confirmed("Integration changed event", { withBreakout: true });
    // Another event holds the same venue on the new day, so the move conflicts.
    const rival = await planning("Integration rival event", { startsAt: "2099-07-02T10:00", endsAt: "2099-07-02T16:00" });
    const rivalBooking = await submitVenueBookingRequest(rival.id, original.venueId);
    await fixture.signIn(staff);
    await decideVenueBookingRequest(rivalBooking, "approved", "");

    const requestId = await approvedChange(original.id);
    await fixture.signIn(actors.coordinatorB);
    const { values } = await loadEventForChangeApply(original.id, ["confirmed"]);
    const moved = { ...values, startsAt: "2099-07-02T10:00", endsAt: "2099-07-02T16:00" };
    const untouched = await eventSnapshot(original.id);
    await expect(applyEventChangeRequest(requestId, moved)).rejects.toThrow(/assigned coordinator/i);
    expect(await eventSnapshot(original.id)).toEqual(untouched);

    await fixture.signIn(actors.coordinatorA);
    expect(await applyEventChangeRequest(requestId, moved)).toMatchObject({ status: "implemented", returnedToPlanning: true, eventStatus: "planning" });

    // AC10: the event returns to Planning, recorded in its history, and Safety Officers are told.
    expect((await eventRow(original.id)).status).toBe("planning");
    expect((await listEventStatusHistory(original.id)).at(-1)).toMatchObject({ fromStatus: "confirmed", toStatus: "planning", changedById: actors.coordinatorA.id });
    expect(await notificationRecipients(original.id, "safety_review_reset")).toContain(officer.id);

    // AC01/AC11: nothing is flagged or cancelled; the coordinator updates the bookings themselves (202611010008).
    const bookings = await bookingRows(original.id);
    expect(bookings.map((row) => [row.status, row.needs_review])).toEqual([["approved", false], ["approved", false]]);
    expect(bookings.every((row) => row.cancelled_at === null)).toBe(true);
    // AC02: Venue Staff are notified once per affected booking.
    expect(await notificationCount(original.id, "venue_change_review")).toBe(2);
    expect(await notificationRecipients(original.id, "venue_change_review")).toEqual([staff.id, staff.id]);

    // AC7: the request is Implemented and cannot be applied twice.
    expect((await listEventChangeRequests(original.id)).at(-1)).toMatchObject({ status: "implemented" });
    await expect(applyEventChangeRequest(requestId, moved)).rejects.toThrow(/Only an Approved change request/);
  });

  // SPM-39 AC08 (other changes leave the status unchanged) and AC1 (nothing flagged).
  it("leaves a Confirmed event confirmed and flags nothing when the change does not affect arrangements", async () => {
    const event = await confirmed("Integration minor change event");
    const requestId = await approvedChange(event.id, "Reword the description");
    await fixture.signIn(actors.coordinatorA);
    const { values } = await loadEventForChangeApply(event.id, ["confirmed"]);
    expect(await applyEventChangeRequest(requestId, { ...values, description: "A clearer description" }))
      .toMatchObject({ status: "implemented", returnedToPlanning: false, eventStatus: "confirmed", affectedBookingIds: [] });
    expect(await eventRow(event.id)).toMatchObject({ status: "confirmed", description: "A clearer description" });
    expect((await bookingRows(event.id)).map((row) => row.needs_review)).toEqual([false]);
    expect(await notificationCount(event.id, "venue_change_review")).toBe(0);
    expect(await notificationCount(event.id, "safety_review_reset")).toBe(0);
  });

  // SPM-38 AC6 and SPM-39 AC3/AC4: an unassigned Requested event goes through the Lead.
  it("routes a change request on an unassigned event to the Lead, who can decide but not apply it", async () => {
    const { id } = await submitRequestedEvent(fixture, actors.organiser, "Integration unassigned change event");
    await fixture.signIn(actors.organiser);
    const { data } = await submitEventChangeRequest(id, { description: "Rename" }, "Clearer name");
    expect(await notificationRecipients(id, "event_change")).toEqual([actors.lead.id]);

    await fixture.signIn(actors.coordinatorA);
    await expect(decideEventChangeRequest(data.id, "approved", "Notes")).rejects.toThrow(/Coordinator Lead/);
    await fixture.signIn(actors.lead);
    await decideEventChangeRequest(data.id, "approved", "Apply once a coordinator is assigned");
    const { values } = await loadEventForChangeApply(id, ["requested"]);
    const before = await eventRow(id);
    await expect(applyEventChangeRequest(data.id, { ...values, description: "Edited by the Lead" })).rejects.toThrow(/assigned coordinator/i);
    expect(await eventRow(id)).toEqual(before);

    // Once assigned, the new coordinator is told of the waiting request and can apply it.
    await assignEventCoordinator(id, actors.coordinatorB.id, "");
    await fixture.signIn(actors.coordinatorB);
    expect((await listNotifications()).filter((n) => n.eventId === id && n.type === "event_change")).not.toHaveLength(0);
    expect(await applyEventChangeRequest(data.id, { ...values, description: "Edited by the coordinator" }))
      .toMatchObject({ status: "implemented", returnedToPlanning: false });
    expect((await eventRow(id)).description).toBe("Edited by the coordinator");
  });

  // SPM-45: cancellation releases bookings and holds, notifies, and blocks further action.
  it("cancels an event: assigned coordinator only, reason required, bookings and holds released and kept, roles notified", async () => {
    // A Planning event with a pending booking and a booking on hold.
    const planned = await planning("Integration cancelled planning event");
    const venueId = await fixture.venue(100);
    const pending = await submitVenueBookingRequest(planned.id, venueId);
    const held = await submitVenueBookingRequest(planned.id, await fixture.venue(100), BREAKOUT);
    await fixture.signIn(staff);
    await placeVenueBookingHold(held, new Date(Date.now() + 12 * 3_600_000).toISOString());

    await fixture.signIn(actors.coordinatorB);
    const before = await eventSnapshot(planned.id);
    await expect(cancelEvent(planned.id, "Sponsor withdrew")).rejects.toThrow(/assigned coordinator/i);
    await fixture.signIn(actors.coordinatorA);
    await expect(cancelEvent(planned.id, "   ")).rejects.toThrow();
    expect(await eventSnapshot(planned.id)).toEqual(before);

    await cancelEvent(planned.id, "Sponsor withdrew");
    expect((await eventRow(planned.id)).status).toBe("cancelled");
    const released = await bookingRows(planned.id);
    expect(released.map((row) => [row.id, row.status, row.cancellation_reason, row.cancelled_by]))
      .toEqual(expect.arrayContaining([
        [pending, "cancelled", "Sponsor withdrew", actors.coordinatorA.id], [held, "cancelled", "Sponsor withdrew", actors.coordinatorA.id],
      ]));
    expect(released.every((row) => row.cancelled_at !== null)).toBe(true);
    expect((await listEventStatusHistory(planned.id)).at(-1)).toMatchObject({ toStatus: "cancelled", changedById: actors.coordinatorA.id });
    // Organiser, coordinator and Venue Staff are told.
    expect(await notificationRecipients(planned.id, "cancellation")).toEqual(
      [actors.organiser.id, actors.coordinatorA.id, staff.id].sort(),
    );

    // Blocked afterwards; the prior records stay readable to authorised users.
    const cancelled = await eventSnapshot(planned.id);
    await expect(submitVenueBookingRequest(planned.id, venueId)).rejects.toThrow(/Planning/);
    await expect(cancelEvent(planned.id, "Again")).rejects.toThrow(/cannot be cancelled/);
    await fixture.signIn(actors.organiser);
    await expect(submitEventChangeRequest(planned.id, { description: "Late" }, "Reason")).rejects.toThrow(/can only be submitted/i);
    expect(await eventSnapshot(planned.id)).toEqual(cancelled);
    const kept = await listVenueBookingsForEvent(planned.id);
    expect(kept.map((booking) => booking.status)).toEqual(["cancelled", "cancelled"]);
    expect(kept.every((booking) => booking.cancellationReason === "Sponsor withdrew" && booking.cancelledByName)).toBe(true);

    // A Pending Safety Check event also tells the Safety Officer; a Rejected event cannot be cancelled.
    const review = await planning("Integration cancelled review event");
    const reviewVenue = await fixture.venue(100);
    const reviewBooking = await submitVenueBookingRequest(review.id, reviewVenue);
    await fixture.signIn(staff);
    await decideVenueBookingRequest(reviewBooking, "approved", "");
    await fixture.signIn(actors.coordinatorA);
    await saveVenueSafetyChecks(review.id, SAFETY_CHECKS);
    await submitEventForSafetyCheck(review.id);
    await cancelEvent(review.id, "Cancelled during the safety check");
    expect((await eventRow(review.id)).status).toBe("cancelled");
    expect(await notificationRecipients(review.id, "cancellation")).toContain(officer.id);

    const { id: rejectedId } = await submitRequestedEvent(fixture, actors.organiser, "Integration rejected before cancel");
    await fixture.signIn(actors.lead);
    await assignEventCoordinator(rejectedId, actors.coordinatorA.id, "");
    await fixture.signIn(actors.coordinatorA);
    await decideEvent(rejectedId, "rejected", "Out of scope");
    await expect(cancelEvent(rejectedId, "Too late")).rejects.toThrow(/cannot be cancelled/);
  });

  // SPM-46 AC1-AC5, AC7: completion rules and a closed event.
  it("completes a Confirmed event only after its end, keeps its records readable, and blocks every planning action", async () => {
    // One event still in the future (AC2/AC3/AC4) and one whose schedule is already over (AC1).
    const future = await confirmed("Integration future event");
    const event = await confirmed("Integration completed event", { pastSchedule: true });

    // AC4: not Confirmed.
    await fixture.signIn(actors.coordinatorA);
    const planned = await planning("Integration not yet confirmed event");
    await expect(completeEvent(planned.id)).rejects.toThrow(/Only a Confirmed event/);
    // AC3: not the assigned coordinator (a generic message; the state is unchanged).
    await fixture.signIn(actors.coordinatorB);
    const notYours = await eventSnapshot(event.id);
    await expect(completeEvent(event.id)).rejects.toThrow(/could not be marked completed/i);
    expect(await eventSnapshot(event.id)).toEqual(notYours);
    // AC2: too early, with the earliest time returned and the status unchanged.
    await fixture.signIn(actors.coordinatorA);
    const early = await eventSnapshot(future.id);
    await expect(completeEvent(future.id)).rejects.toThrow(/can be marked completed from/i);
    expect(new Date(await loadEventCompletionAvailableAt(future.id)).toISOString()).toBe(new Date((await eventRow(future.id)).ends_at).toISOString());
    expect(await eventSnapshot(future.id)).toEqual(early);

    // AC1: completion records the coordinator and time in the status history.
    await completeEvent(event.id);
    expect((await eventRow(event.id)).status).toBe("completed");
    expect((await listEventStatusHistory(event.id)).at(-1)).toMatchObject({ fromStatus: "confirmed", toStatus: "completed", changedById: actors.coordinatorA.id });

    // AC5: bookings, decisions and history remain visible.
    expect((await listVenueBookingsForEvent(event.id)).map((booking) => booking.status)).toEqual(["approved"]);
    expect(await listSafetyCheckDecisions(event.id)).toHaveLength(1);
    expect(await listEventDecisions(event.id)).toHaveLength(1);

    // AC7: every planning or change action is blocked and nothing changes.
    const closed = await eventSnapshot(event.id);
    const closedRow = await eventRow(event.id);
    await expect(cancelEvent(event.id, "Too late")).rejects.toThrow(/cannot be cancelled/);
    await expect(requestClarification(event.id, "Question", ["title"])).rejects.toThrow();
    await expect(submitVenueBookingRequest(event.id, event.venueId)).rejects.toThrow();
    await expect(updateEventAsCoordinator(event.id, { ...event.values, title: "Integration renamed after completion" })).rejects.toThrow();
    await fixture.signIn(actors.lead);
    await expect(assignEventCoordinator(event.id, actors.coordinatorB.id, "Reassign")).rejects.toThrow();
    await fixture.signIn(actors.organiser);
    await expect(submitEventChangeRequest(event.id, { description: "Late" }, "Reason")).rejects.toThrow(/can only be submitted/i);
    await expect(saveEventDraft({ ...event.values, title: "Integration renamed by organiser" }, event.id)).rejects.toThrow();
    expect(await eventSnapshot(event.id)).toEqual(closed);
    expect(await eventRow(event.id)).toEqual(closedRow);
  });

  // SPM-76 AC1-AC3, AC5: the notification centre is per user.
  it("lists only the signed-in user's notifications newest first and tracks read state per user", async () => {
    const first = await submitRequestedEvent(fixture, actors.organiser, "Integration notification one");
    const second = await submitRequestedEvent(fixture, actors.organiser, "Integration notification two");
    await fixture.signIn(actors.lead);
    await assignEventCoordinator(first.id, actors.coordinatorA.id, "");
    await assignEventCoordinator(second.id, actors.coordinatorA.id, "");

    await fixture.signIn(actors.coordinatorA);
    const own = await listNotifications();
    expect(own.map((n) => n.eventId).sort()).toEqual([first.id, second.id].sort());
    expect(own.every((n) => n.message && n.eventId && n.createdAt)).toBe(true);
    expect(own.map((n) => n.createdAt)).toEqual([...own.map((n) => n.createdAt)].sort().reverse());
    expect(await getUnreadNotificationCount()).toBe(2);

    // AC3: mark one, then all, as read; the count follows.
    await markNotificationRead(own[0].id);
    expect(await getUnreadNotificationCount()).toBe(1);
    await markAllNotificationsRead();
    expect(await getUnreadNotificationCount()).toBe(0);
    expect((await listNotifications()).every((n) => n.readAt !== null)).toBe(true);

    // AC1/AC5: another user sees none of these, and cannot mark them read.
    await fixture.signIn(actors.coordinatorB);
    expect(await listNotifications()).toEqual([]);
    await markNotificationRead(own[0].id).catch(() => undefined);
    expect((await database.query("select count(*)::int as n from public.notifications where recipient_id = $1 and read_at is null", [actors.coordinatorA.id])).rows[0].n).toBe(0);
    await fixture.signIn(actors.organiser);
    const organiserOwn = await listNotifications();
    expect(organiserOwn.map((n) => n.id)).not.toEqual(expect.arrayContaining(own.map((n) => n.id)));
    expect(await getUnreadNotificationCount()).toBe(organiserOwn.length);
  });
});
