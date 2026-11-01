import { expect } from "vitest";
import { emptyEventRequestFormValues, type EventRequestFormValues } from "@spm/shared";
import { assignEventCoordinator } from "@/features/event-requests/services/all-events";
import { decideEvent } from "@/features/event-requests/services/decisions";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { submitEventRequest } from "@/features/event-requests/services/event-submissions";
import { database, type IntegrationFixture } from "../fixtures";

/** Fixed-date request that passes submission validation; override per workflow. */
export function eventRequest(title: string, overrides: Partial<EventRequestFormValues> = {}): EventRequestFormValues {
  return {
    ...structuredClone(emptyEventRequestFormValues), title,
    purpose: "Workshop", description: "Workflow integration requirements",
    expectedAttendance: "30", startsAt: "2099-05-04T10:00", endsAt: "2099-05-04T12:00",
    venue: { preferredLocation: "Bugis", minimumCapacity: "30", accessibilityNotes: "", layoutNotes: "", facilities: [] },
    requirementsAcknowledged: true,
    ...overrides,
  };
}

type User = Awaited<ReturnType<IntegrationFixture["user"]>>;

/** The standard cast; every user is synthetic and removed by the fixture. */
export async function createActors(fixture: IntegrationFixture) {
  return {
    organiser: await fixture.organiser(),
    lead: await fixture.user("event_coordinator_lead"),
    coordinatorA: await fixture.user("event_coordinator"),
    coordinatorB: await fixture.user("event_coordinator"),
  };
}

/**
 * A genuinely submitted request: real draft save, then the real submission
 * route. Leaves the organiser signed in. Starts Requested and unassigned.
 */
export async function submitRequestedEvent(
  fixture: IntegrationFixture,
  organiser: User,
  title: string,
  overrides: Partial<EventRequestFormValues> = {},
) {
  await fixture.signIn(organiser);
  const values = eventRequest(title, overrides);
  const id = await saveEventDraft(values);
  await submitEventRequest(id, values);
  expect((await database.query("select status, assigned_coordinator_id from public.events where id = $1", [id])).rows)
    .toEqual([{ status: "requested", assigned_coordinator_id: null }]);
  return { id, values };
}

/** Independent read oracle: a refused action must leave all of this unchanged. */
export async function eventSnapshot(id: string) {
  const { rows } = await database.query(`
    select jsonb_build_object(
      'event', to_jsonb(e),
      'assignments', (select jsonb_agg(to_jsonb(a) order by a.id) from public.event_coordinator_assignments a where event_id = e.id),
      'statuses', (select jsonb_agg(to_jsonb(s) order by s.id) from public.event_status_history s where event_id = e.id),
      'clarifications', (select jsonb_agg(to_jsonb(c) order by c.id) from public.clarifications c where event_id = e.id),
      'decisions', (select jsonb_agg(to_jsonb(d) order by d.id) from public.event_decisions d where event_id = e.id),
      'bookings', (select jsonb_agg(to_jsonb(b) order by b.id) from public.venue_bookings b where event_id = e.id),
      'notifications', (select jsonb_agg(to_jsonb(n) order by n.id) from public.notifications n where event_id = e.id)
    ) as snapshot from public.events e where e.id = $1
  `, [id]);
  return rows[0].snapshot;
}

/** Recipients of notifications of one type for an event, sorted. */
export async function notificationRecipients(eventId: string, type: string) {
  const { rows } = await database.query(
    "select recipient_id from public.notifications where event_id = $1 and type = $2::public.notification_type",
    [eventId, type],
  );
  return rows.map((row) => row.recipient_id as string).sort();
}

/**
 * A Planning event reached through the real flow: submit, Lead assigns, the
 * assigned coordinator approves. Leaves that coordinator signed in.
 */
export async function planningEvent(
  fixture: IntegrationFixture,
  cast: { organiser: User; lead: User; coordinator: User },
  title: string,
  overrides: Partial<EventRequestFormValues> = {},
) {
  const { id, values } = await submitRequestedEvent(fixture, cast.organiser, title, overrides);
  await fixture.signIn(cast.lead);
  await assignEventCoordinator(id, cast.coordinator.id, "");
  await fixture.signIn(cast.coordinator);
  await decideEvent(id, "approved", "");
  expect((await database.query("select status from public.events where id = $1", [id])).rows[0].status).toBe("planning");
  return { id, values };
}
