import { expect } from "vitest";
import { emptyEventRequestFormValues, type EventRequestFormValues } from "@spm/shared";
import { assignEventCoordinator } from "@/features/event-requests/services/all-events";
import { decideEvent } from "@/features/event-requests/services/decisions";
import { decideEventSafetyCheck } from "@/features/safety-check/services/safety-check-decisions";
import { submitEventForSafetyCheck } from "@/features/safety-check/services/event-readiness";
import { saveVenueSafetyChecks } from "@/features/safety-check/services/safety-plan";
import { decideVenueBookingRequest, submitVenueBookingRequest } from "@/features/venues/services/venue-bookings";
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

/** Safety checks a coordinator ticks so an event can be Ready. */
export const SAFETY_CHECKS = {
  emergencyAccessChecked: true, emergencyAccess: "Exits A and B", restrictionsChecked: true, restrictions: "No open flames",
  crowdMovementChecked: true, crowdMovementPlan: "One-way flow",
};

/** The fixture venue's area tag, a 6-hour window and one breakout period inside it. */
export const AREA_VENUE: Partial<EventRequestFormValues> = {
  venue: { preferredLocation: "Central Area", minimumCapacity: "30", accessibilityNotes: "", layoutNotes: "", facilities: [] },
};
export const DEFAULT_WINDOW = { expectedAttendance: "60", startsAt: "2099-07-01T10:00", endsAt: "2099-07-01T16:00" };
export const BREAKOUT = {
  label: "Breakout 1", startsAt: "2099-07-01T12:00:00+08:00", endsAt: "2099-07-01T14:00:00+08:00", expectedHeadcount: 20,
};

/**
 * A Confirmed event reached through the real flow: Planning, a main booking
 * (and optionally a breakout) approved by Venue Staff, safety checks ticked,
 * submitted by the coordinator and approved by the Safety Officer. Leaves
 * the officer signed in.
 */
export async function confirmedEvent(
  fixture: IntegrationFixture,
  cast: { organiser: User; lead: User; coordinator: User; staff: User; officer: User },
  title: string,
  options: { withBreakout?: boolean; overrides?: Partial<EventRequestFormValues>; pastSchedule?: boolean } = {},
) {
  const { id, values } = await planningEvent(fixture, cast, title, { ...AREA_VENUE, ...DEFAULT_WINDOW, ...options.overrides });
  if (options.pastSchedule) {
    // Setup only, while the event is still in Planning (a Confirmed event is locked even
    // against direct SQL): a real wait for an event to finish is impossible.
    await database.query("update public.events set starts_at = '2020-07-01T02:00:00Z', ends_at = '2020-07-01T08:00:00Z' where id = $1", [id]);
  }
  const venueId = await fixture.venue(100);
  const bookingIds = [await submitVenueBookingRequest(id, venueId)];
  if (options.withBreakout) bookingIds.push(await submitVenueBookingRequest(id, await fixture.venue(100), BREAKOUT));
  await fixture.signIn(cast.staff);
  for (const booking of bookingIds) await decideVenueBookingRequest(booking, "approved", "");
  await fixture.signIn(cast.coordinator);
  await saveVenueSafetyChecks(id, SAFETY_CHECKS);
  await submitEventForSafetyCheck(id);
  await fixture.signIn(cast.officer);
  await decideEventSafetyCheck(id, "approved", "");
  expect((await database.query("select status from public.events where id = $1", [id])).rows[0].status).toBe("confirmed");
  return { id, values, venueId, bookingIds };
}
