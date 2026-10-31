import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues } from "@spm/shared";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { listVenueAvailability } from "@/features/venues/services/venue-availability";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

let fixture: IntegrationFixture;
let organiser: Awaited<ReturnType<IntegrationFixture["user"]>>;
let coordinator: Awaited<ReturnType<IntegrationFixture["user"]>>;
let otherCoordinator: Awaited<ReturnType<IntegrationFixture["user"]>>;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let venueId: string;
let venueName: string;

async function event(assigned: string, startsAt: string, endsAt: string) {
  await fixture.signIn(organiser);
  const id = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title: `Integration availability ${randomUUID()}`, purpose: "Meeting", description: "Synthetic event", expectedAttendance: "20", startsAt, endsAt });
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: organiser.id, role: "authenticated" })]);
    await client.query("update public.events set status = 'requested' where id = $1", [id]);
    await client.query("update public.events set status = 'planning', assigned_coordinator_id = $2 where id = $1", [id, assigned]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
  return id;
}
beforeEach(async () => {
  fixture = new IntegrationFixture();
  venueName = `Integration availability venue ${randomUUID()}`;
  organiser = await fixture.organiser(); coordinator = await fixture.user("event_coordinator");
  otherCoordinator = await fixture.user("event_coordinator"); staff = await fixture.user("venue_staff");
  venueId = randomUUID();
  await database.query("insert into public.venues (id, name, location, capacity, operating_hours) values ($1, $2, 'Block A', 100, '[{\"days\":[\"mon\",\"tue\"],\"opensAt\":\"08:00\",\"closesAt\":\"18:00\"}]'::jsonb)", [venueId, venueName]);
});
afterEach(async () => {
  try {
    await database.query("delete from public.events where organiser_id = $1", [organiser.id]);
    await database.query("delete from public.venue_unavailability where venue_id = $1", [venueId]);
    await database.query("delete from public.venues where id = $1", [venueId]);
  } finally { await fixture.cleanup(); }
});
afterAll(async () => { try { expect((await database.query("select count(*)::int n from public.venues where name like 'Integration availability venue %' ")).rows[0].n).toBe(0); await assertNoFixtureResidue(); } finally { await database.end(); } });

describe("SPM-20 venue availability", () => {
  // SPM-20 AC4: an empty list means no unavailable periods, not a query failure.
  it("returns no unavailable periods for an empty venue", async () => {
    await fixture.signIn(staff);
    expect(await listVenueAvailability(venueId, staff.id)).toEqual([]);
  });
  // SPM-20 AC1/AC2/AC3: a coordinator must see occupied periods even when
  // another coordinator owns the booking; their own booking is a positive control.
  it("shows booking and block periods to authorised internal users", async () => {
    const own = await event(coordinator.id, "2099-04-06T10:00", "2099-04-06T11:00");
    const other = await event(otherCoordinator.id, "2099-04-06T12:00", "2099-04-06T13:00");
    const ownId = randomUUID(), otherId = randomUUID(), blockId = randomUUID();
    await database.query("insert into public.venue_bookings (id, event_id, venue_id, requested_by, starts_at, ends_at, status) values ($1,$2,$3,$4,'2099-04-06T10:00+08','2099-04-06T11:00+08','pending'), ($5,$6,$3,$7,'2099-04-06T12:00+08','2099-04-06T13:00+08','approved')", [ownId, own, venueId, coordinator.id, otherId, other, otherCoordinator.id]);
    await database.query("insert into public.venue_unavailability (id, venue_id, starts_at, ends_at, reason) values ($1,$2,'2099-04-06T14:00+08','2099-04-06T15:00+08','Maintenance')", [blockId, venueId]);
    const expected = [
      expect.objectContaining({ id: ownId, type: "pending", startsAt: "2099-04-06T02:00:00+00:00", endsAt: "2099-04-06T03:00:00+00:00" }),
      expect.objectContaining({ id: otherId, type: "confirmed", startsAt: "2099-04-06T04:00:00+00:00", endsAt: "2099-04-06T05:00:00+00:00" }),
      expect.objectContaining({ id: blockId, type: "blocked", startsAt: "2099-04-06T06:00:00+00:00", endsAt: "2099-04-06T07:00:00+00:00" }),
    ];
    await fixture.signIn(staff);
    expect(await listVenueAvailability(venueId, staff.id)).toEqual(expect.arrayContaining(expected));
    await fixture.signIn(coordinator);
    expect(await listVenueAvailability(venueId, coordinator.id)).toEqual(expect.arrayContaining(expected));
  });
});
