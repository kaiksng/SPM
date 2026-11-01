import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SafetyCheckSubmissionError } from "@spm/shared";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { listEventStatusHistory } from "@/features/event-requests/services/event-lifecycle";
import { updateEventAsCoordinator } from "@/features/event-requests/services/coordinator-event-edit";
import { listNotifications } from "@/features/notifications/services/notifications";
import {
  listPendingSafetyCheckEvents, decideEventSafetyCheck, listSafetyCheckDecisions,
} from "@/features/safety-check/services/safety-check-decisions";
import {
  loadEventReadiness, loadLatestSafetyCheckSubmission, loadSafetyReviewDetails, resolveArrangementFlag, submitEventForSafetyCheck,
} from "@/features/safety-check/services/event-readiness";
import { saveVenueSafetyChecks } from "@/features/safety-check/services/safety-plan";
import { supabase } from "@/lib/supabase-client";
import {
  confirmVenueBookingHold, decideVenueBookingRequest, listVenueBookingsForEvent, placeVenueBookingHold,
  setMainVenueBooking, submitVenueBookingRequest, withdrawVenueBookingRequest,
} from "@/features/venues/services/venue-bookings";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";
import { createActors, eventSnapshot, notificationRecipients, planningEvent } from "./support/workflow";

// Workflow 4: safety and confirmation. Readiness (SPM-33), the officer's
// approve / request changes / reject (SPM-90, SPM-89), edit locks, status
// history (SPM-79/12), direct-edit blocking (SPM-11) and the organiser's view
// of confirmed arrangements (SPM-35). Disruption returning an event to
// Planning is already proved in the SPM-83 suite; equipment reservation is
// workflow 3, so only an unreserved requirement is used here as a blocker.

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

const CHECKS = {
  emergencyAccessChecked: true, emergencyAccess: "Exits A and B", restrictionsChecked: true, restrictions: "No open flames",
  crowdMovementChecked: true, crowdMovementPlan: "One-way flow",
};
const AREA = { venue: { preferredLocation: "Central Area", minimumCapacity: "30", accessibilityNotes: "", layoutNotes: "", facilities: [] } };
const WINDOW = { expectedAttendance: "60", startsAt: "2099-07-01T10:00", endsAt: "2099-07-01T16:00" };
const breakout = {
  label: "Breakout 1", startsAt: "2099-07-01T12:00:00+08:00", endsAt: "2099-07-01T14:00:00+08:00", expectedHeadcount: 20,
};

/** A Planning event with an unrequested venue. Leaves the coordinator signed in. */
async function planning(title: string) {
  return planningEvent(fixture, { organiser: actors.organiser, lead: actors.lead, coordinator: actors.coordinatorA }, title, { ...AREA, ...WINDOW });
}

/** Booking(s) requested by the coordinator and approved by staff, safety checks ticked: genuinely Ready. */
async function readyEvent(title: string, withBreakout = false) {
  const { id, values } = await planning(title);
  const venueId = await fixture.venue(100);
  const mainBooking = await submitVenueBookingRequest(id, venueId);
  const bookingIds = [mainBooking];
  if (withBreakout) bookingIds.push(await submitVenueBookingRequest(id, await fixture.venue(100), breakout));
  await fixture.signIn(staff);
  for (const booking of bookingIds) await decideVenueBookingRequest(booking, "approved", "");
  await fixture.signIn(actors.coordinatorA);
  await saveVenueSafetyChecks(id, CHECKS);
  expect((await loadEventReadiness(id)).ready).toBe(true);
  return { id, values, mainBooking, bookingIds };
}

async function status(id: string) {
  return (await database.query("select status from public.events where id = $1", [id])).rows[0].status as string;
}

async function flags(id: string) {
  return (await database.query(
    "select id, needs_review from public.venue_bookings where event_id = $1 and status in ('pending','approved','on_hold') order by requested_at", [id])).rows;
}

describe("Workflow: safety and confirmation", () => {
  // SPM-33 AC1-AC4, AC6, AC10 (blockers), SPM-85 AC13: readiness is derived and blocks submission.
  it("derives readiness from records and refuses submission until every blocker is cleared", async () => {
    const { id } = await planning("Integration readiness event");
    const venueId = await fixture.venue(100);
    const codes = async () => (await loadEventReadiness(id)).outstandingItems.map((item) => item.code);

    // Nothing arranged yet: no main venue and unticked safety checks.
    expect(await codes()).toEqual(expect.arrayContaining(["no_main_venue", "emergency_access_not_checked", "restrictions_not_checked", "crowd_movement_not_checked"]));
    const before = await eventSnapshot(id);
    await expect(submitEventForSafetyCheck(id)).rejects.toBeInstanceOf(SafetyCheckSubmissionError);
    await expect(submitEventForSafetyCheck(id)).rejects.toMatchObject({
      outstandingItems: expect.arrayContaining([expect.objectContaining({ code: "no_main_venue" })]),
    });
    expect(await status(id)).toBe("planning");
    expect(await eventSnapshot(id)).toEqual(before);

    // A Pending booking is not Complete; an active hold counts as Needs Review.
    const booking = await submitVenueBookingRequest(id, venueId);
    expect((await loadEventReadiness(id)).venues).toEqual([expect.objectContaining({ bookingId: booking, isMainVenue: true, status: "pending" })]);
    expect(await codes()).toContain("main_venue_not_ready");
    await fixture.signIn(staff);
    await placeVenueBookingHold(booking, new Date(Date.now() + 12 * 3_600_000).toISOString());
    await fixture.signIn(actors.coordinatorA);
    expect((await loadEventReadiness(id)).venues[0]).toMatchObject({ status: "needs_review" });
    await confirmVenueBookingHold(booking);

    // An equipment requirement not yet reserved blocks readiness (setup row; reservation is workflow 3).
    const equipmentId = await fixture.equipment();
    const requirementId = randomUUID();
    await database.query(
      `insert into public.event_equipment_requirements (id, event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
       values ($1, $2, $3, 'Integration projector', 1, '2099-07-01T10:00:00+08:00', '2099-07-01T16:00:00+08:00')`,
      [requirementId, id, equipmentId],
    );
    const blocked = await loadEventReadiness(id);
    expect(blocked.ready).toBe(false);
    expect(blocked.outstandingItems.map((item) => item.message).join(" ")).toContain("Integration projector");
    await database.query("delete from public.event_equipment_requirements where id = $1", [requirementId]);

    // Approved venue but unticked safety checks is still not Ready, and readiness cannot be set by hand.
    await fixture.signIn(staff);
    await decideVenueBookingRequest(booking, "approved", "");
    await fixture.signIn(actors.coordinatorA);
    expect((await loadEventReadiness(id)).ready).toBe(false);
    await expect(supabase.from("events").update({ emergency_access_checked: true, restrictions_checked: true, crowd_movement_checked: true }).eq("id", id).select()).resolves.toMatchObject({ data: [] });
    expect((await loadEventReadiness(id)).ready).toBe(false);
    await saveVenueSafetyChecks(id, CHECKS);
    expect(await loadEventReadiness(id)).toMatchObject({ ready: true, venueArrangementStatus: "complete", outstandingItems: [] });

    // Only the assigned coordinator can submit.
    for (const actor of [actors.organiser, actors.coordinatorB]) {
      await fixture.signIn(actor);
      await expect(submitEventForSafetyCheck(id)).rejects.toThrow(/assigned coordinator/i);
    }
    expect(await status(id)).toBe("planning");
  });

  // SPM-33 AC5, AC8, SPM-79/12: submission, snapshot, notification, history and the arrangement lock.
  it("submits a Ready event, records the round, notifies Safety Officers and locks the arrangements", async () => {
    const { id, mainBooking, bookingIds } = await readyEvent("Integration submission event", true);

    await fixture.signIn(actors.coordinatorA);
    const result = await submitEventForSafetyCheck(id);
    expect(result).toMatchObject({ round: 1, eventId: id, status: "pending_safety_check" });
    expect(await status(id)).toBe("pending_safety_check");

    // AC8: coordinator, time and a snapshot of the venues, period, attendance and equipment.
    const submission = await loadLatestSafetyCheckSubmission(id);
    expect(submission).toMatchObject({ round: 1 });
    const row = (await database.query(
      "select coordinator_id, attendance_snapshot, venues_snapshot, period_snapshot, equipment_snapshot from public.event_safety_check_submissions where event_id = $1", [id])).rows[0];
    expect(row).toMatchObject({ coordinator_id: actors.coordinatorA.id, attendance_snapshot: 60 });
    expect(JSON.stringify(row.venues_snapshot)).toContain(mainBooking);
    expect(row.venues_snapshot).toHaveLength(bookingIds.length);
    expect(row.period_snapshot).toBeTruthy();

    // AC5: every Safety Officer is notified; the officer's queue lists the event.
    expect(await notificationRecipients(id, "safety_check_requested")).toContain(officer.id);
    await fixture.signIn(officer);
    expect((await listPendingSafetyCheckEvents()).map((event) => event.eventId)).toContain(id);
    expect((await listNotifications()).filter((n) => n.eventId === id && n.type === "safety_check_requested")).toHaveLength(1);

    // SPM-79/12: the transition is recorded with previous status, new status, actor and time.
    await fixture.signIn(actors.coordinatorA);
    const history = await listEventStatusHistory(id);
    expect(history.at(-1)).toMatchObject({ fromStatus: "planning", toStatus: "pending_safety_check", changedAt: expect.any(String) });

    // AC8: while pending, venue and technical arrangements cannot be changed; a second submission is refused.
    await fixture.signIn(actors.coordinatorA);
    const locked = await eventSnapshot(id);
    await expect(withdrawVenueBookingRequest(bookingIds[1], "Trying to change")).rejects.toThrow(/cannot be changed while the event is Pending Safety Check/i);
    await expect(setMainVenueBooking(bookingIds[1])).rejects.toThrow(/only be changed while the event is in Planning/i);
    await expect(saveVenueSafetyChecks(id, { ...CHECKS, restrictions: "Changed" })).rejects.toThrow(/only be changed while the event is in Planning/i);
    await expect(submitEventForSafetyCheck(id)).rejects.toThrow(/Only a Planning event/i);
    expect(await eventSnapshot(id)).toEqual(locked);
  });

  // SPM-90 AC1-AC6: review facts, approval record, notifications and guards.
  it("lets only a Safety Officer approve, confirms the event, records the review and notifies the coordinator and organiser", async () => {
    const { id } = await readyEvent("Integration approval event");
    await fixture.signIn(actors.coordinatorA);
    await submitEventForSafetyCheck(id);

    // AC4: only a Safety Officer can approve.
    const pending = await eventSnapshot(id);
    for (const actor of [actors.coordinatorA, actors.organiser, staff]) {
      await fixture.signIn(actor);
      await expect(decideEventSafetyCheck(id, "approved", "")).rejects.toThrow(/Safety Officer/);
      expect(await eventSnapshot(id)).toEqual(pending);
    }

    // AC2/AC3: the review facts, read-only for the officer.
    await fixture.signIn(officer);
    const details = await loadSafetyReviewDetails(id);
    expect(details).toMatchObject({ expectedAttendance: 60, emergencyAccess: "Exits A and B", restrictions: "No open flames", crowdMovementPlan: "One-way flow" });
    expect(details.venues).toEqual([expect.objectContaining({ capacity: 100, headcount: 60, underCapacity: false, isMainVenue: true })]);
    await supabase.from("events").update({ title: "Integration edited by officer" }).eq("id", id);
    expect(await eventSnapshot(id)).toEqual(pending);

    // AC4: approval with a note records reviewer, note and time and confirms the event.
    const started = Date.now();
    await decideEventSafetyCheck(id, "approved", "Exits checked");
    expect(await status(id)).toBe("confirmed");
    // After the decision the officer can no longer read the event or its rounds (RLS), so the
    // coordinator reads the record; the officer's own history is the SafetyReviewHistory RPC.
    await fixture.signIn(actors.coordinatorA);
    const [entry] = await listSafetyCheckDecisions(id);
    expect(entry).toMatchObject({ round: 1, outcome: "approved", reason: "Exits checked", flaggedBookingIds: [] });
    expect(entry.decidedByName).toBeTruthy();
    expect(new Date(entry.decidedAt).getTime()).toBeGreaterThanOrEqual(started - 5_000);
    expect((await database.query("select decided_by from public.event_safety_check_decisions where event_id = $1", [id])).rows)
      .toEqual([{ decided_by: officer.id }]);
    expect((await listEventStatusHistory(id)).at(-1)).toMatchObject({ fromStatus: "pending_safety_check", toStatus: "confirmed", changedById: officer.id });

    // AC5: coordinator and organiser are notified.
    expect(await notificationRecipients(id, "safety_check_decision")).toEqual([actors.coordinatorA.id, actors.organiser.id].sort());

    // AC6: an event no longer Pending Safety Check cannot be approved again.
    await fixture.signIn(officer);
    await expect(decideEventSafetyCheck(id, "approved", "")).rejects.toThrow(/Pending Safety Check/);
  });

  // SPM-89 AC1, AC2, AC4, AC5 and SPM-33 AC8 (new round): request changes, fix, resubmit, approve.
  it("returns the event to Planning with only the chosen booking flagged, then runs a second round to approval", async () => {
    const { id, bookingIds } = await readyEvent("Integration changes event", true);
    await fixture.signIn(actors.coordinatorA);
    await submitEventForSafetyCheck(id);

    await fixture.signIn(officer);
    const pending = await eventSnapshot(id);
    await expect(decideEventSafetyCheck(id, "changes_requested", "", [bookingIds[1]])).rejects.toThrow(/reason/i);
    await expect(decideEventSafetyCheck(id, "changes_requested", "Fix the exits")).rejects.toThrow(/Select at least one/i);
    expect(await eventSnapshot(id)).toEqual(pending);

    await decideEventSafetyCheck(id, "changes_requested", "Breakout exit is blocked", [bookingIds[1]]);
    expect(await status(id)).toBe("planning");
    expect((await flags(id)).map((row) => [row.id, row.needs_review])).toEqual([[bookingIds[0], false], [bookingIds[1], true]]);
    await fixture.signIn(actors.coordinatorA);
    const [round1] = await listSafetyCheckDecisions(id);
    expect(round1).toMatchObject({ round: 1, outcome: "changes_requested", reason: "Breakout exit is blocked", flaggedBookingIds: [bookingIds[1]] });
    // Request changes tells the coordinator who must act; the organiser is told on approve and reject.
    expect(await notificationRecipients(id, "safety_check_decision")).toEqual([actors.coordinatorA.id]);

    // The flagged booking counts as Needs Review, so the event is not Ready until the coordinator resolves it.
    await fixture.signIn(actors.coordinatorA);
    expect(await loadEventReadiness(id)).toMatchObject({ ready: false });
    await expect(submitEventForSafetyCheck(id)).rejects.toBeInstanceOf(SafetyCheckSubmissionError);
    await resolveArrangementFlag(id, { bookingId: bookingIds[1] });
    expect(await loadEventReadiness(id)).toMatchObject({ ready: true });

    // A resubmission starts a new round, which the officer then approves.
    expect(await submitEventForSafetyCheck(id)).toMatchObject({ round: 2, status: "pending_safety_check" });
    await fixture.signIn(officer);
    await decideEventSafetyCheck(id, "approved", "");
    expect(await status(id)).toBe("confirmed");
    await fixture.signIn(actors.coordinatorA);
    expect((await listSafetyCheckDecisions(id)).map((entry) => [entry.round, entry.outcome])).toEqual([[2, "approved"], [1, "changes_requested"]]);
  });

  // SPM-89 AC1, AC3, AC4, AC5: reject flags every arrangement.
  it("flags every venue booking when the officer rejects, records the reason and returns the event to Planning", async () => {
    const { id, bookingIds } = await readyEvent("Integration rejection event", true);
    await fixture.signIn(actors.coordinatorA);
    await submitEventForSafetyCheck(id);

    await fixture.signIn(officer);
    const pending = await eventSnapshot(id);
    await expect(decideEventSafetyCheck(id, "rejected", "")).rejects.toThrow(/reason/i);
    expect(await eventSnapshot(id)).toEqual(pending);

    await decideEventSafetyCheck(id, "rejected", "Arrangement is unsafe");
    expect(await status(id)).toBe("planning");
    expect((await flags(id)).map((row) => [row.id, row.needs_review])).toEqual(bookingIds.map((bookingId) => [bookingId, true]));
    expect((await listSafetyCheckDecisions(id))[0]).toMatchObject({ outcome: "rejected", reason: "Arrangement is unsafe", flaggedBookingIds: expect.arrayContaining(bookingIds) });
    expect(await notificationRecipients(id, "safety_check_decision")).toEqual([actors.coordinatorA.id, actors.organiser.id].sort());

    await fixture.signIn(actors.coordinatorA);
    expect((await loadEventReadiness(id)).ready).toBe(false);
  });

  // SPM-11 AC1/AC3, SPM-79 AC3, SPM-12 AC03/AC04, SPM-35 AC1/AC4/AC5: a Confirmed event.
  it("blocks direct edits and invalid transitions on a Confirmed event and shows the organiser only their own arrangements", async () => {
    const { id, values, bookingIds } = await readyEvent("Integration confirmed event", true);
    await fixture.signIn(actors.coordinatorA);
    await submitEventForSafetyCheck(id);
    await fixture.signIn(officer);
    await decideEventSafetyCheck(id, "approved", "");
    expect(await status(id)).toBe("confirmed");

    // SPM-79/12: the whole lifecycle is recorded in order (read as the coordinator; the officer
    // loses event access once the event leaves Pending Safety Check).
    await fixture.signIn(actors.coordinatorA);
    expect((await listEventStatusHistory(id)).map((change) => change.toStatus).slice(-4))
      .toEqual(["requested", "planning", "pending_safety_check", "confirmed"]);

    // SPM-11: neither the edit forms nor raw table updates change a Confirmed event, and no field audit is written.
    const fieldChanges = async () => (await database.query("select count(*)::int as n from public.event_field_changes where event_id = $1", [id])).rows[0].n as number;
    const auditBefore = await fieldChanges();
    const before = await eventSnapshot(id);
    await fixture.signIn(actors.organiser);
    await expect(saveEventDraft({ ...values, title: "Integration renamed by organiser" }, id)).rejects.toThrow();
    await supabase.from("events").update({ title: "Integration raw organiser edit" }).eq("id", id);
    await fixture.signIn(actors.coordinatorA);
    await expect(updateEventAsCoordinator(id, { ...values, title: "Integration renamed by coordinator" })).rejects.toThrow();
    await supabase.from("events").update({ title: "Integration raw coordinator edit" }).eq("id", id);
    expect(await eventSnapshot(id)).toEqual(before);
    expect(await fieldChanges()).toBe(auditBefore);

    // SPM-79 AC3: a transition the lifecycle does not allow is refused and the status is unchanged.
    const client = await database.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actors.coordinatorA.id, role: "authenticated" })]);
      await expect(client.query("update public.events set status = 'requested' where id = $1", [id])).rejects.toThrow(/Invalid event status transition/);
    } finally { await client.query("rollback"); client.release(); }
    expect(await status(id)).toBe("confirmed");

    // SPM-35: the owner lists every booking with its own period; another organiser sees none.
    await fixture.signIn(actors.organiser);
    const owned = await listVenueBookingsForEvent(id);
    expect(owned.map((booking) => booking.id).sort()).toEqual([...bookingIds].sort());
    expect(owned.find((booking) => booking.label === "Breakout 1")).toMatchObject({ status: "approved" });
    expect(new Set(owned.map((booking) => booking.startsAt)).size).toBe(2);
    const stranger = await fixture.organiser();
    await fixture.signIn(stranger);
    expect(await listVenueBookingsForEvent(id)).toEqual([]);
  });
});
