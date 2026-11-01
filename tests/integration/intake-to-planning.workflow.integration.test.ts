import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assignEventCoordinator, listAllEvents, listCoordinators } from "@/features/event-requests/services/all-events";
import { listAssignedEvents } from "@/features/event-requests/services/assigned-events";
import { getClarificationReviewState, listClarifications, requestClarification, resolveClarification, respondToClarification } from "@/features/event-requests/services/clarifications";
import { decideEvent, listEventDecisions } from "@/features/event-requests/services/decisions";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { loadEventDetail } from "@/features/event-requests/services/event-details";
import { listEventCoordinatorAssignmentHistory } from "@/features/event-requests/services/event-reassignment";
import { listNotifications } from "@/features/notifications/services/notifications";
import { submitVenueBookingRequest } from "@/features/venues/services/venue-bookings";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";
import { createActors, eventSnapshot, notificationRecipients, submitRequestedEvent } from "./support/workflow";

// Workflow 1: intake to planning. One event's early life across features:
// submission (SPM-3) -> Lead queue and assignment (SPM-80/81) -> clarification
// (SPM-6) -> approve/reject (SPM-7) -> reassignment (SPM-84) -> coordinator
// access (SPM-15). Assignment rules themselves live in the SPM-81 suite.

let fixture: IntegrationFixture;
let actors: Awaited<ReturnType<typeof createActors>>;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  actors = await createActors(fixture);
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

/** Setup step: the Lead assigns through the real service. */
async function assign(id: string, coordinator: { id: string }) {
  await fixture.signIn(actors.lead);
  await assignEventCoordinator(id, coordinator.id, "");
}

async function eventRow(id: string) {
  return (await database.query("select status, assigned_coordinator_id from public.events where id = $1", [id])).rows[0];
}

describe("Workflow: intake to planning", () => {
  // SPM-3 S01, SPM-80 AC1/AC3/AC7, SPM-6 AC8, SPM-7 AC1: an unassigned request is
  // queued for the Lead, invisible to coordinators and cannot be reviewed.
  it("queues a submitted request for the Lead and keeps it unreviewable until a coordinator is assigned", async () => {
    const { id } = await submitRequestedEvent(fixture, actors.organiser, "Integration intake queue");

    await fixture.signIn(actors.lead);
    const queued = (await listAllEvents()).find((event) => event.id === id);
    // SPM-80 AC2: the queue entry carries what the Lead needs to allocate it.
    expect(queued).toMatchObject({ status: "requested", assignedCoordinatorId: null, expectedAttendance: 30 });
    expect(queued?.submittedAt).not.toBeNull();
    expect(queued?.organiserName).toBeTruthy();
    // Every Lead is told a request needs a coordinator.
    expect(await notificationRecipients(id, "event_awaiting_assignment")).toContain(actors.lead.id);

    await fixture.signIn(actors.coordinatorA);
    expect((await listAssignedEvents(actors.coordinatorA.id)).map((event) => event.id)).not.toContain(id);
    const before = await eventSnapshot(id);
    await expect(requestClarification(id, "What is the budget?", ["title"])).rejects.toThrow(/assigned coordinator/i);
    await expect(decideEvent(id, "approved", "")).rejects.toThrow(/assigned coordinator/i);
    await expect(decideEvent(id, "rejected", "No coordinator yet")).rejects.toThrow(/assigned coordinator/i);
    expect(await eventSnapshot(id)).toEqual(before);

    // Control: the same Lead action works once a coordinator is assigned.
    await assign(id, actors.coordinatorA);
    expect(await eventRow(id)).toEqual({ status: "requested", assigned_coordinator_id: actors.coordinatorA.id });
    expect((await listAllEvents()).find((event) => event.id === id)).toMatchObject({ assignedCoordinatorId: actors.coordinatorA.id });
    await fixture.signIn(actors.coordinatorA);
    expect((await listAssignedEvents(actors.coordinatorA.id)).map((event) => event.id)).toContain(id);
  });

  // SPM-6 AC1-AC8, SPM-3 S03: a clarification round from request to resolution.
  it("runs a clarification round: locked fields, response, blocked decision, resolution and history", async () => {
    const { id, values } = await submitRequestedEvent(fixture, actors.organiser, "Integration clarification round");
    await assign(id, actors.coordinatorA);

    // AC8: an unrelated coordinator cannot start a round.
    await fixture.signIn(actors.coordinatorB);
    await expect(requestClarification(id, "Not mine", ["title"])).rejects.toThrow(/assigned coordinator/i);

    // AC1/AC2: the assigned coordinator opens a round; status stays Requested.
    await fixture.signIn(actors.coordinatorA);
    const before = Date.now();
    await requestClarification(id, "Please confirm expected attendance", ["expectedAttendance"]);
    expect(await eventRow(id)).toMatchObject({ status: "requested" });
    const [round] = await listClarifications(id);
    expect(round).toMatchObject({ question: "Please confirm expected attendance", status: "open", permittedFields: ["expectedAttendance"], response: null });
    expect(new Date(round.requestedAt).getTime()).toBeGreaterThanOrEqual(before - 5_000);
    expect((await database.query("select requested_by from public.clarifications where id = $1", [round.id])).rows[0])
      .toEqual({ requested_by: actors.coordinatorA.id });
    expect(await getClarificationReviewState(id)).toEqual({ status: "open", permittedFields: ["expectedAttendance"] });
    expect(await notificationRecipients(id, "clarification")).toEqual([actors.organiser.id]);

    // AC5/S04: approving or rejecting is blocked while the round is unresolved.
    const open = await eventSnapshot(id);
    await expect(decideEvent(id, "approved", "")).rejects.toThrow(/unresolved clarification/i);
    await expect(decideEvent(id, "rejected", "Not now")).rejects.toThrow(/unresolved clarification/i);
    expect(await eventSnapshot(id)).toEqual(open);

    // AC3: only the permitted field is editable; a locked field is refused.
    await fixture.signIn(actors.organiser);
    await expect(saveEventDraft({ ...values, title: "Integration renamed while locked" }, id)).rejects.toThrow(/locked/i);
    await saveEventDraft({ ...values, expectedAttendance: "45" }, id);
    expect((await database.query("select title, expected_attendance from public.events where id = $1", [id])).rows[0])
      .toEqual({ title: "Integration clarification round", expected_attendance: 45 });

    // AC4: the response records content, time and actor, and the coordinator is told.
    await expect(respondToClarification(round.id, "")).rejects.toThrow();
    await respondToClarification(round.id, "Attendance is now 45");
    expect((await database.query("select response, responded_by, responded_at is not null as timed, status from public.clarifications where id = $1", [round.id])).rows[0])
      .toEqual({ response: "Attendance is now 45", responded_by: actors.organiser.id, timed: true, status: "answered" });
    expect(await notificationRecipients(id, "clarification")).toEqual([actors.coordinatorA.id, actors.organiser.id].sort());
    await fixture.signIn(actors.coordinatorA);
    expect((await listNotifications()).filter((n) => n.eventId === id && n.type === "clarification")).toHaveLength(1);

    // An answered round may also be closed by the decision itself (see the next test);
    // here the coordinator closes it explicitly.

    // AC6: only the assigned coordinator can close; then the decision is available again.
    await fixture.signIn(actors.coordinatorB);
    await expect(resolveClarification(round.id)).rejects.toThrow(/assigned coordinator/i);
    await fixture.signIn(actors.coordinatorA);
    await resolveClarification(round.id);
    expect(await getClarificationReviewState(id)).toBeUndefined();
    await decideEvent(id, "approved", "");
    expect(await eventRow(id)).toMatchObject({ status: "planning" });

    // AC7: the round stays viewable with its response, in sequence.
    expect(await listClarifications(id)).toEqual([expect.objectContaining({
      id: round.id, response: "Attendance is now 45", status: "resolved",
    })]);
  });

  // SPM-6 AC5/AC6/S04 (as agreed): a decision is blocked while a clarification is open and
  // unanswered; once the organiser has answered, the decision itself closes the round.
  it("blocks a decision on an unanswered clarification and lets a decision on an answered one close it", async () => {
    for (const decision of ["approved", "rejected"] as const) {
      const { id } = await submitRequestedEvent(fixture, actors.organiser, `Integration answered ${decision}`);
      await assign(id, actors.coordinatorA);
      await fixture.signIn(actors.coordinatorA);
      await requestClarification(id, "Please confirm the schedule", ["startsAt"]);
      const [round] = await listClarifications(id);

      // Open and unanswered: blocked, nothing changes.
      const open = await eventSnapshot(id);
      await expect(decideEvent(id, decision, "Reason")).rejects.toThrow(/unresolved clarification/i);
      expect(await eventSnapshot(id)).toEqual(open);

      // Answered: the decision succeeds and closes the round, recording who closed it.
      await fixture.signIn(actors.organiser);
      await respondToClarification(round.id, "Schedule confirmed");
      await fixture.signIn(actors.coordinatorA);
      await decideEvent(id, decision, "Reason");
      expect(await eventRow(id)).toMatchObject({ status: decision === "approved" ? "planning" : "rejected" });
      expect((await database.query("select status, resolved_by, resolved_at is not null as timed from public.clarifications where id = $1", [round.id])).rows[0])
        .toEqual({ status: "resolved", resolved_by: actors.coordinatorA.id, timed: true });
      expect(await getClarificationReviewState(id)).toBeUndefined();
      expect(await listClarifications(id)).toEqual([expect.objectContaining({ id: round.id, response: "Schedule confirmed", status: "resolved" })]);
    }
  });

  // SPM-7 AC1/AC2/AC5/AC6 and S03: approval, its record and the organiser's notice.
  it("lets only the assigned coordinator approve, records the decision and notifies the organiser", async () => {
    const { id } = await submitRequestedEvent(fixture, actors.organiser, "Integration approval");
    await assign(id, actors.coordinatorA);
    const before = await eventSnapshot(id);

    for (const actor of [actors.organiser, actors.coordinatorB]) {
      await fixture.signIn(actor);
      await expect(decideEvent(id, "approved", "")).rejects.toThrow();
      expect(await eventSnapshot(id)).toEqual(before);
    }

    await fixture.signIn(actors.coordinatorA);
    const started = Date.now();
    await decideEvent(id, "approved", "");
    expect(await eventRow(id)).toEqual({ status: "planning", assigned_coordinator_id: actors.coordinatorA.id });
    const [decision] = await listEventDecisions(id);
    expect(decision).toMatchObject({ decision: "approved", rationale: null });
    expect(new Date(decision.decidedAt).getTime()).toBeGreaterThanOrEqual(started - 5_000);
    expect((await database.query("select decided_by from public.event_decisions where event_id = $1", [id])).rows)
      .toEqual([{ decided_by: actors.coordinatorA.id }]);
    // Only a Requested event can be decided.
    await expect(decideEvent(id, "approved", "")).rejects.toThrow(/Requested/);

    expect(await notificationRecipients(id, "decision")).toEqual([actors.organiser.id]);
    await fixture.signIn(actors.organiser);
    expect((await listNotifications()).filter((n) => n.eventId === id && n.type === "decision")).toHaveLength(1);
  });

  // SPM-7 AC3/AC4/AC5/AC6, S04: rejection needs a reason and blocks later planning.
  it("requires a reason to reject, records it, and blocks venue planning on the rejected event", async () => {
    const venueId = await fixture.venue();
    const rejected = await submitRequestedEvent(fixture, actors.organiser, "Integration rejection");
    const approved = await submitRequestedEvent(fixture, actors.organiser, "Integration planning control");
    await assign(rejected.id, actors.coordinatorA);
    await assign(approved.id, actors.coordinatorA);

    await fixture.signIn(actors.coordinatorA);
    const before = await eventSnapshot(rejected.id);
    await expect(decideEvent(rejected.id, "rejected", "   ")).rejects.toThrow(/reason/i);
    expect(await eventSnapshot(rejected.id)).toEqual(before);

    await decideEvent(rejected.id, "rejected", "Outside the supported scope");
    expect(await eventRow(rejected.id)).toMatchObject({ status: "rejected" });
    expect(await listEventDecisions(rejected.id)).toEqual([expect.objectContaining({ decision: "rejected", rationale: "Outside the supported scope" })]);
    expect((await database.query("select decided_by from public.event_decisions where event_id = $1", [rejected.id])).rows)
      .toEqual([{ decided_by: actors.coordinatorA.id }]);
    expect(await notificationRecipients(rejected.id, "decision")).toEqual([actors.organiser.id]);

    // S04: venue planning on a Rejected event is refused and leaves no booking.
    const afterRejection = await eventSnapshot(rejected.id);
    await expect(submitVenueBookingRequest(rejected.id, venueId)).rejects.toThrow();
    expect(await eventSnapshot(rejected.id)).toEqual(afterRejection);

    // Control: the same venue request works for the approved event.
    await decideEvent(approved.id, "approved", "");
    await submitVenueBookingRequest(approved.id, venueId);
    expect((await database.query("select status from public.venue_bookings where event_id = $1", [approved.id])).rows)
      .toEqual([{ status: "pending" }]);
  });

  // SPM-84 AC1-AC6, AC8 and AC7 (server-side access): reassignment hands the event over.
  it("reassigns a coordinator, closes the old assignment, moves access and keeps the open clarification", async () => {
    const { id } = await submitRequestedEvent(fixture, actors.organiser, "Integration reassignment");
    await assign(id, actors.coordinatorA);
    await fixture.signIn(actors.coordinatorA);
    await requestClarification(id, "Open round before handover", ["title"]);
    const [round] = await listClarifications(id);

    // AC8: only the Lead; AC2: not to the current coordinator.
    const before = await eventSnapshot(id);
    for (const actor of [actors.organiser, actors.coordinatorB]) {
      await fixture.signIn(actor);
      await expect(assignEventCoordinator(id, actors.coordinatorB.id, "Take over")).rejects.toThrow(/Only the Event Coordinator Lead/);
    }
    await fixture.signIn(actors.lead);
    await expect(assignEventCoordinator(id, actors.coordinatorA.id, "Same person")).rejects.toThrow(/already assigned|different/i);
    expect(await eventSnapshot(id)).toEqual(before);

    // AC1: reassign with a reason.
    await assignEventCoordinator(id, actors.coordinatorB.id, "Coordinator A is on leave");
    expect(await eventRow(id)).toEqual({ status: "requested", assigned_coordinator_id: actors.coordinatorB.id });

    // AC3: the first assignment is closed, the second is open.
    const history = await listEventCoordinatorAssignmentHistory(id);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ newCoordinatorId: actors.coordinatorA.id, endedAt: expect.any(String) });
    expect(history[1]).toMatchObject({
      previousCoordinatorId: actors.coordinatorA.id, newCoordinatorId: actors.coordinatorB.id,
      changedById: actors.lead.id, reason: "Coordinator A is on leave", endedAt: null,
    });

    // AC4/AC7: the previous coordinator immediately loses view and action rights.
    await fixture.signIn(actors.coordinatorA);
    expect((await listAssignedEvents(actors.coordinatorA.id)).map((event) => event.id)).not.toContain(id);
    await expect(resolveClarification(round.id)).rejects.toThrow(/assigned coordinator/i);
    await expect(decideEvent(id, "approved", "")).rejects.toThrow(/assigned coordinator/i);
    await expect(requestClarification(id, "Still mine?", ["title"])).rejects.toThrow(/assigned coordinator/i);

    // AC4/AC5/AC8: the new coordinator sees it and inherits the same open round.
    await fixture.signIn(actors.coordinatorB);
    expect((await listAssignedEvents(actors.coordinatorB.id)).map((event) => event.id)).toContain(id);
    expect(await listClarifications(id)).toEqual([expect.objectContaining({ id: round.id, status: "open" })]);
    await resolveClarification(round.id);
    expect(await getClarificationReviewState(id)).toBeUndefined();

    // AC6: previous coordinator, new coordinator and organiser are each notified of the handover.
    // The first assignment told coordinator A and the organiser; the handover adds A, B and the organiser.
    expect(await notificationRecipients(id, "assignment")).toEqual([
      actors.coordinatorA.id, actors.coordinatorA.id, actors.coordinatorB.id, actors.organiser.id, actors.organiser.id,
    ].sort());

    // AC8: a Rejected event cannot be reassigned.
    await decideEvent(id, "rejected", "Closing out the handover test");
    const rejected = await eventSnapshot(id);
    await fixture.signIn(actors.lead);
    await expect(assignEventCoordinator(id, actors.coordinatorA.id, "Too late")).rejects.toThrow(/cannot be/i);
    expect(await eventSnapshot(id)).toEqual(rejected);
  });

  // SPM-15 AC1-AC3 and SPM-80 AC4: coordinator lists and the Lead's workload view.
  it("shows each coordinator only their own events, opens details, and counts active work for the Lead", async () => {
    const mine = await submitRequestedEvent(fixture, actors.organiser, "Integration coordinator A event");
    const theirs = await submitRequestedEvent(fixture, actors.organiser, "Integration coordinator B event");
    const done = await submitRequestedEvent(fixture, actors.organiser, "Integration rejected event");
    await assign(mine.id, actors.coordinatorA);
    await assign(theirs.id, actors.coordinatorB);
    await assign(done.id, actors.coordinatorA);
    await fixture.signIn(actors.coordinatorA);
    await decideEvent(done.id, "rejected", "Not viable");

    // SPM-15 AC1-AC3: nonempty own list, no one else's events, details open.
    const own = (await listAssignedEvents(actors.coordinatorA.id)).map((event) => event.id);
    expect(own).toEqual(expect.arrayContaining([mine.id]));
    expect(own).not.toContain(theirs.id);
    expect(await loadEventDetail(mine.id)).toMatchObject({ id: mine.id, title: "Integration coordinator A event" });
    // Viewing is deliberately open to all coordinators (can_view_event); only actions
    // are restricted to the assigned coordinator (SPM-84 AC7).
    expect(await loadEventDetail(theirs.id)).toMatchObject({ id: theirs.id });
    const theirsBefore = await eventSnapshot(theirs.id);
    await expect(decideEvent(theirs.id, "approved", "")).rejects.toThrow(/assigned coordinator/i);
    expect(await eventSnapshot(theirs.id)).toEqual(theirsBefore);

    // SPM-80 AC4: the Lead's roster counts only active events (the rejected one is excluded).
    await fixture.signIn(actors.lead);
    const counts = Object.fromEntries((await listCoordinators())
      .filter((option) => [actors.coordinatorA.id, actors.coordinatorB.id].includes(option.id))
      .map((option) => [option.id, option.activeEventCount]));
    expect(counts).toEqual({ [actors.coordinatorA.id]: 1, [actors.coordinatorB.id]: 1 });
    const overview = await listAllEvents();
    expect(overview.find((event) => event.id === done.id)).toMatchObject({ status: "rejected" });
    expect(overview.find((event) => event.id === theirs.id)).toMatchObject({ status: "requested", assignedCoordinatorId: actors.coordinatorB.id });
  });
});
