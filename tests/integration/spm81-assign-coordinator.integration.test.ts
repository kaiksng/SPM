import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyEventRequestFormValues, type EventRequestFormValues } from "@spm/shared";
import { assignEventCoordinator, listAllEvents, listCoordinators } from "@/features/event-requests/services/all-events";
import { listAssignedEvents } from "@/features/event-requests/services/assigned-events";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { listEventCoordinatorAssignmentHistory } from "@/features/event-requests/services/event-reassignment";
import { submitEventRequest } from "@/features/event-requests/services/event-submissions";
import { listNotifications } from "@/features/notifications/services/notifications";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

type TestUser = Awaited<ReturnType<IntegrationFixture["organiser"]>>;

function request(title = "Integration assignment event"): EventRequestFormValues {
  return {
    ...structuredClone(emptyEventRequestFormValues), title,
    purpose: "Workshop", description: "Coordinator assignment requirements",
    expectedAttendance: "30", startsAt: "2099-05-04T10:00", endsAt: "2099-05-04T12:00",
    venue: { preferredLocation: "Bugis", minimumCapacity: "30", accessibilityNotes: "", layoutNotes: "", facilities: [] },
    requirementsAcknowledged: true,
  };
}

let fixture: IntegrationFixture;
let organiser: TestUser;
let lead: TestUser;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  organiser = await fixture.organiser();
  lead = await fixture.user("event_coordinator_lead");
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

/** A genuinely submitted request: Requested, no coordinator, in the Lead's queue. */
async function submittedRequest(title?: string) {
  await fixture.signIn(organiser);
  const values = request(title);
  const id = await saveEventDraft(values);
  await submitEventRequest(id, values);
  const { rows } = await database.query("select status, assigned_coordinator_id from public.events where id = $1", [id]);
  expect(rows).toEqual([{ status: "requested", assigned_coordinator_id: null }]);
  return id;
}

/**
 * Administrative fixture preparation along legal status edges with triggers
 * enabled, as in SPM-14. Not a tested business action.
 */
async function preparedEvent(path: string[], coordinatorId: string | null, dates = { startsAt: "2099-05-04T10:00", endsAt: "2099-05-04T12:00" }) {
  await fixture.signIn(organiser);
  const id = await saveEventDraft({ ...request(), ...dates });
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: organiser.id, role: "authenticated" })]);
    for (const next of path) {
      await client.query(
        "update public.events set status = $2::public.event_status, assigned_coordinator_id = $3 where id = $1",
        [id, next, coordinatorId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
  return id;
}

/** Independent read oracle: a refused assignment must leave all of this unchanged. */
async function snapshot(id: string) {
  const { rows } = await database.query(`
    select jsonb_build_object(
      'event', to_jsonb(e),
      'assignments', (select jsonb_agg(to_jsonb(a) order by a.id) from public.event_coordinator_assignments a where event_id = e.id),
      'statuses', (select jsonb_agg(to_jsonb(s) order by s.id) from public.event_status_history s where event_id = e.id),
      'notifications', (select jsonb_agg(to_jsonb(n) order by n.id) from public.notifications n where event_id = e.id)
    ) as snapshot from public.events e where e.id = $1
  `, [id]);
  return rows[0].snapshot;
}

async function assignmentNotifications(id: string) {
  const { rows } = await database.query(
    "select recipient_id from public.notifications where event_id = $1 and type = 'assignment' order by recipient_id",
    [id],
  );
  return rows.map((row) => row.recipient_id as string).sort();
}

describe("SPM-81: the Lead assigns an Event Coordinator through the service, RPC, lists and notifications", () => {
  // SPM-81 AC01/AC03/AC04/AC05: one assignment, its history, both lists and both notifications.
  it("assigns exactly one coordinator to an unassigned Requested event and records the outcome", async () => {
    const coordinator = await fixture.user("event_coordinator");
    const id = await submittedRequest();

    await fixture.signIn(lead);
    // SPM-81 AC04: before assignment the Lead sees it unassigned (the queue's input).
    expect((await listAllEvents()).find((event) => event.id === id))
      .toMatchObject({ status: "requested", assignedCoordinatorId: null });
    const before = Date.now();
    await assignEventCoordinator(id, coordinator.id, "");

    // SPM-81 AC01: exactly one coordinator, status unchanged.
    expect((await database.query("select status, assigned_coordinator_id from public.events where id = $1", [id])).rows)
      .toEqual([{ status: "requested", assigned_coordinator_id: coordinator.id }]);

    // SPM-81 AC03: one open history entry naming the coordinator, the Lead and when.
    const history = await listEventCoordinatorAssignmentHistory(id);
    expect(history).toEqual([expect.objectContaining({
      previousCoordinatorId: null, newCoordinatorId: coordinator.id,
      changedById: lead.id, reason: null, endedAt: null,
    })]);
    const changedAt = new Date(history[0].changedAt).getTime();
    expect(changedAt).toBeGreaterThanOrEqual(before - 5_000);
    expect(changedAt).toBeLessThanOrEqual(Date.now() + 5_000);
    expect((await database.query("select count(*)::int as n from public.event_coordinator_assignments where event_id = $1", [id])).rows[0].n).toBe(1);

    // SPM-81 AC04: the Lead now sees it assigned, so it is no longer queue input.
    expect((await listAllEvents()).find((event) => event.id === id))
      .toMatchObject({ assignedCoordinatorId: coordinator.id });

    // SPM-81 AC04/AC05: the coordinator's own list and notifications.
    await fixture.signIn(coordinator);
    expect((await listAssignedEvents(coordinator.id)).map((event) => event.id)).toEqual([id]);
    expect((await listNotifications()).filter((n) => n.eventId === id))
      .toEqual([expect.objectContaining({ type: "assignment", readAt: null })]);

    // SPM-81 AC05: the organiser is notified too; nobody else is.
    await fixture.signIn(organiser);
    expect((await listNotifications()).filter((n) => n.eventId === id))
      .toEqual([expect.objectContaining({ type: "assignment", readAt: null })]);
    expect(await assignmentNotifications(id)).toEqual([coordinator.id, organiser.id].sort());
  });

  // SPM-81 AC01: only the Lead can assign; the successful Lead case above is the control.
  it("refuses assignment by the organiser and by a coordinator without changing the event", async () => {
    const coordinator = await fixture.user("event_coordinator");
    const id = await submittedRequest();
    const before = await snapshot(id);

    for (const actor of [organiser, coordinator]) {
      await fixture.signIn(actor);
      await expect(assignEventCoordinator(id, coordinator.id, ""))
        .rejects.toThrow("Only the Event Coordinator Lead can assign or reassign an event");
      expect(await snapshot(id)).toEqual(before);
    }

    await fixture.signIn(lead);
    await assignEventCoordinator(id, coordinator.id, "");
    expect((await database.query("select assigned_coordinator_id from public.events where id = $1", [id])).rows[0])
      .toEqual({ assigned_coordinator_id: coordinator.id });
  });

  // SPM-81 AC02: only Event Coordinators are offered and accepted.
  it("offers and accepts only users with the Event Coordinator role", async () => {
    const first = await fixture.user("event_coordinator");
    const second = await fixture.user("event_coordinator");
    const safety = await fixture.user("safety_officer");
    const venueStaff = await fixture.user("venue_staff");
    const id = await submittedRequest();
    const before = await snapshot(id);

    await fixture.signIn(lead);
    const offered = (await listCoordinators()).map((option) => option.id);
    expect(offered).toEqual(expect.arrayContaining([first.id, second.id]));
    for (const ineligible of [organiser, lead, safety, venueStaff]) {
      expect(offered).not.toContain(ineligible.id);
      await expect(assignEventCoordinator(id, ineligible.id, ""))
        .rejects.toThrow("An event can only be assigned to an Event Coordinator");
      expect(await snapshot(id)).toEqual(before);
    }

    await assignEventCoordinator(id, second.id, "");
    expect((await database.query("select assigned_coordinator_id from public.events where id = $1", [id])).rows[0])
      .toEqual({ assigned_coordinator_id: second.id });
  });

  // SPM-81 AC06: an already-assigned event cannot be assigned again; the
  // refusal points to reassignment. A reassignment with a reason is SPM-84.
  it("refuses assigning an event that already has a coordinator and keeps the first assignment", async () => {
    const first = await fixture.user("event_coordinator");
    const other = await fixture.user("event_coordinator");
    const id = await submittedRequest();
    await fixture.signIn(lead);
    await assignEventCoordinator(id, first.id, "");
    const before = await snapshot(id);

    await expect(assignEventCoordinator(id, other.id, "")).rejects.toThrow("Explain why this event is being reassigned");
    await expect(assignEventCoordinator(id, first.id, "")).rejects.toThrow("already assigned to this event");
    expect(await snapshot(id)).toEqual(before);
    expect(await assignmentNotifications(id)).toEqual([first.id, organiser.id].sort());
  });

  // SPM-81 AC07: Draft, Rejected, Cancelled and Completed events cannot be assigned.
  it.each([
    ["draft", []],
    ["rejected", ["requested", "rejected"]],
    ["cancelled", ["requested", "cancelled"]],
    ["completed", ["requested", "planning", "pending_safety_check", "confirmed", "completed"]],
  ] as const)("refuses assigning a %s event", async (status, path) => {
    const original = await fixture.user("event_coordinator");
    const candidate = await fixture.user("event_coordinator");
    const dates = status === "completed"
      ? { startsAt: "2020-05-04T10:00", endsAt: "2020-05-04T12:00" }
      : undefined;
    const id = await preparedEvent([...path], status === "draft" ? null : original.id, dates);
    expect((await database.query("select status from public.events where id = $1", [id])).rows[0].status).toBe(status);
    const before = await snapshot(id);

    await fixture.signIn(lead);
    await expect(assignEventCoordinator(id, candidate.id, ""))
      .rejects.toThrow(`An event with status ${status} cannot be assigned`);
    expect(await snapshot(id)).toEqual(before);
  });

  // SPM-81 AC08 (first sentence): each option carries the coordinator's active-event count.
  it("shows each coordinator's current number of active events and updates it after assignment", async () => {
    const busy = await fixture.user("event_coordinator");
    const idle = await fixture.user("event_coordinator");
    await preparedEvent(["requested"], busy.id);
    await preparedEvent(["requested", "planning"], busy.id);
    await preparedEvent(["requested", "cancelled"], busy.id);
    await preparedEvent(["requested", "planning", "pending_safety_check", "confirmed", "completed"], busy.id,
      { startsAt: "2020-05-04T10:00", endsAt: "2020-05-04T12:00" });
    const id = await submittedRequest();

    await fixture.signIn(lead);
    const counts = async () => Object.fromEntries((await listCoordinators())
      .filter((option) => [busy.id, idle.id].includes(option.id))
      .map((option) => [option.id, option.activeEventCount]));
    expect(await counts()).toEqual({ [busy.id]: 2, [idle.id]: 0 });

    await assignEventCoordinator(id, idle.id, "");
    expect(await counts()).toEqual({ [busy.id]: 2, [idle.id]: 1 });
  });

  // SPM-81 AC08 (second sentence): two Leads assigning the same request at
  // once. Independent application clients; the winner is not predetermined.
  it("lets only one of two simultaneous Lead assignments succeed", async () => {
    const secondLead = await fixture.user("event_coordinator_lead");
    const coordinatorA = await fixture.user("event_coordinator");
    const coordinatorB = await fixture.user("event_coordinator");
    const id = await submittedRequest();

    // A second, separately constructed application client and service module.
    vi.resetModules();
    const secondClient = (await import("@/lib/supabase-client")).supabase;
    const secondService = await import("@/features/event-requests/services/all-events");
    try {
      await fixture.signIn(lead);
      const { error } = await secondClient.auth.signInWithPassword(secondLead);
      if (error) throw new Error("Could not sign in the second Lead.");
      expect((await secondClient.auth.getUser()).data.user?.id).toBe(secondLead.id);

      const results = await Promise.allSettled([
        assignEventCoordinator(id, coordinatorA.id, ""),
        secondService.assignEventCoordinator(id, coordinatorB.id, ""),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(String(rejected[0].reason)).toContain("Explain why this event is being reassigned");

      const winner = results[0].status === "fulfilled"
        ? { coordinator: coordinatorA.id, lead: lead.id }
        : { coordinator: coordinatorB.id, lead: secondLead.id };
      expect((await database.query("select assigned_coordinator_id from public.events where id = $1", [id])).rows[0])
        .toEqual({ assigned_coordinator_id: winner.coordinator });
      expect((await database.query(
        "select previous_coordinator_id, new_coordinator_id, changed_by, ended_at from public.event_coordinator_assignments where event_id = $1",
        [id],
      )).rows).toEqual([{ previous_coordinator_id: null, new_coordinator_id: winner.coordinator, changed_by: winner.lead, ended_at: null }]);
      expect(await assignmentNotifications(id)).toEqual([winner.coordinator, organiser.id].sort());
    } finally {
      await secondClient.auth.signOut();
      secondClient.auth.stopAutoRefresh();
    }
  });
});
