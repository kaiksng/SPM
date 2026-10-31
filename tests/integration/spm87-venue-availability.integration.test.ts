import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, emptyVenueFormValues, type VenueFormValues } from "@spm/shared";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { checkVenueBookingAvailability } from "@/features/venues/services/venue-bookings";
import { createVenue, updateVenue } from "@/features/venues/services/venues";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

let fixture: IntegrationFixture;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let organiser: Awaited<ReturnType<IntegrationFixture["user"]>>;
let coordinator: Awaited<ReturnType<IntegrationFixture["user"]>>;
let name: string;
let venueId: string;
let stop: (() => Promise<void>) | undefined;
function venue(): VenueFormValues {
  return { ...structuredClone(emptyVenueFormValues), name, location: "Block A", areaTags: ["Central Area"], capacity: "120", operatingHours: [{ days: ["mon"], opensAt: "08:00", closesAt: "18:00" }], layouts: ["Theatre"], setupTimeMinutes: "30", turnaroundTimeMinutes: "45" };
}
async function event(start: string, end: string) {
  await fixture.signIn(organiser);
  const id = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title: `Integration availability ${randomUUID()}`, purpose: "Meeting", description: "Synthetic event", expectedAttendance: "20", startsAt: start, endsAt: end });
  // Prepare legal lifecycle states without claiming to test assignment here.
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: organiser.id, role: "authenticated" })]);
    await client.query("update public.events set status = 'requested' where id = $1", [id]);
    await client.query("update public.events set status = 'planning', assigned_coordinator_id = $2 where id = $1", [id, coordinator.id]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
  return id;
}
beforeAll(async () => { stop = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture(); name = `Integration availability venue ${randomUUID()}`;
  staff = await fixture.user("venue_staff"); organiser = await fixture.organiser(); coordinator = await fixture.user("event_coordinator");
  await fixture.signIn(staff); venueId = (await createVenue(venue())).venueId;
});
afterEach(async () => {
  try {
    await database.query("delete from public.events where organiser_id = $1", [organiser.id]);
    await database.query("delete from public.venues where name = $1", [name]);
  } finally { await fixture.cleanup(); }
});
afterAll(async () => { try { await stop?.(); expect((await database.query("select count(*)::int n from public.venues where name like 'Integration availability venue %' ")).rows[0].n).toBe(0); await assertNoFixtureResidue(); } finally { await database.end(); } });

describe("SPM-87 buffered venue availability", () => {
  // SPM-87 AC1/AC2: adjacent windows touch at 12:45; one minute earlier overlaps.
  it("distinguishes overlapping and exactly touching buffered windows", async () => {
    const existing = await event("2099-04-06T10:00", "2099-04-06T12:00");
    const candidate = await event("2099-04-06T12:00", "2099-04-06T15:00");
    await database.query("insert into public.venue_bookings (event_id, venue_id, requested_by, starts_at, ends_at, status) values ($1, $2, $3, '2099-04-06T10:00:00+08:00', '2099-04-06T12:00:00+08:00', 'pending')", [existing, venueId, coordinator.id]);
    await fixture.signIn(coordinator);
    const overlap = await checkVenueBookingAvailability(venueId, candidate, { startsAt: "2099-04-06T13:14:00+08:00", endsAt: "2099-04-06T14:00:00+08:00" });
    expect(overlap.available).toBe(false);
    expect(overlap.reason).toMatch(/occupied.*0?9:30 AM.*12:45 PM/i);
    expect(await checkVenueBookingAvailability(venueId, candidate, { startsAt: "2099-04-06T13:15:00+08:00", endsAt: "2099-04-06T14:00:00+08:00" })).toEqual({ available: true, reason: null });
    await fixture.signIn(staff);
    await updateVenue(venueId, { ...venue(), setupTimeMinutes: "31" });
    await fixture.signIn(coordinator);
    expect((await checkVenueBookingAvailability(venueId, candidate, { startsAt: "2099-04-06T13:15:00+08:00", endsAt: "2099-04-06T14:00:00+08:00" })).available).toBe(false);
  });
  // SPM-87 AC3: both setup before opening and turnaround after closing are checked.
  it("requires the complete buffered period to fit operating hours and days", async () => {
    const id = await event("2099-04-06T08:00", "2099-04-06T18:00");
    await fixture.signIn(coordinator);
    for (const [startsAt, endsAt] of [["2099-04-06T08:00:00+08:00", "2099-04-06T09:00:00+08:00"], ["2099-04-06T16:00:00+08:00", "2099-04-06T18:00:00+08:00"]]) {
      expect(await checkVenueBookingAvailability(venueId, id, { startsAt, endsAt })).toMatchObject({ available: false, reason: expect.stringMatching(/operating days or hours/) });
    }
    expect(await checkVenueBookingAvailability(venueId, id, { startsAt: "2099-04-06T08:30:00+08:00", endsAt: "2099-04-06T17:15:00+08:00" })).toEqual({ available: true, reason: null });
    const closed = await event("2099-04-07T10:00", "2099-04-07T12:00");
    await fixture.signIn(coordinator);
    expect((await checkVenueBookingAvailability(venueId, closed)).available).toBe(false);
  });
});
