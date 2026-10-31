import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, emptyVenueFormValues, type VenueFormValues } from "@spm/shared";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { createVenue, listFlaggedBookingConflicts, recheckAllVenueConflicts, recheckVenueConflicts, updateVenue } from "@/features/venues/services/venues";
import { apiFetch } from "@/lib/api-client";
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
  return { ...structuredClone(emptyVenueFormValues), name, location: "Block A", areaTags: ["Central Area"], capacity: "120", operatingHours: [{ days: ["mon", "tue"], opensAt: "08:00", closesAt: "18:00" }], layouts: ["Theatre"] };
}
async function booking(start: string, end: string, status: "approved" | "pending") {
  await fixture.signIn(organiser);
  const title = `Integration conflict event ${randomUUID()}`;
  const eventId = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title, purpose: "Meeting", description: "Synthetic event", expectedAttendance: "20", startsAt: start, endsAt: end });
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: organiser.id, role: "authenticated" })]);
    await client.query("update public.events set status = 'requested' where id = $1", [eventId]);
    await client.query("update public.events set status = 'planning', assigned_coordinator_id = $2 where id = $1", [eventId, coordinator.id]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  const id: string = randomUUID();
  await database.query("insert into public.venue_bookings (id,event_id,venue_id,requested_by,starts_at,ends_at,status) values ($1,$2,$3,$4,$5::timestamp at time zone 'Asia/Singapore',$6::timestamp at time zone 'Asia/Singapore',$7::public.request_status)", [id,eventId,venueId,coordinator.id,start,end,status]);
  return { id, eventId, title, status };
}
beforeAll(async () => { stop = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture(); name = `Integration conflict venue ${randomUUID()}`;
  staff = await fixture.user("venue_staff"); organiser = await fixture.organiser(); coordinator = await fixture.user("event_coordinator");
  await fixture.signIn(staff); venueId = (await createVenue(venue())).venueId;
});
afterEach(async () => {
  try {
    await database.query("delete from public.events where organiser_id = $1", [organiser.id]);
    await database.query("delete from public.venue_unavailability where venue_id = $1", [venueId]);
    await database.query("delete from public.venues where name = $1", [name]);
  } finally { await fixture.cleanup(); }
});
afterAll(async () => { try { await stop?.(); expect((await database.query("select count(*)::int n from public.venues where name like 'Integration conflict venue %'")).rows[0].n).toBe(0); await assertNoFixtureResidue(); } finally { await database.end(); } });

describe("SPM-88 venue conflict rechecking", () => {
  // SPM-88 AC1–AC6: real buffer save, automatic flagging, list, recheck and clear.
  it("flags both affected bookings without changing them and clears resolved flags", async () => {
    const first = await booking("2099-06-01T10:00", "2099-06-01T12:00", "approved");
    const second = await booking("2099-06-01T13:00", "2099-06-01T15:00", "pending");
    await fixture.signIn(staff);
    expect((await recheckVenueConflicts(venueId)).activeCount).toBe(0);
    await updateVenue(venueId, { ...venue(), turnaroundTimeMinutes: "90" });
    const flagged = await listFlaggedBookingConflicts();
    expect(flagged).toEqual(expect.arrayContaining([
      expect.objectContaining({ bookingId: first.id, eventId: first.eventId, eventTitle: first.title, venueId, venueName: name, startsAt: "2099-06-01T02:00:00+00:00", endsAt: "2099-06-01T04:00:00+00:00", conflictingEventTitle: second.title }),
      expect.objectContaining({ bookingId: second.id, eventId: second.eventId, eventTitle: second.title, venueId, venueName: name, startsAt: "2099-06-01T05:00:00+00:00", endsAt: "2099-06-01T07:00:00+00:00", conflictingEventTitle: first.title }),
    ]));
    expect(flagged.filter((f) => [first.id,second.id].includes(f.bookingId))).toHaveLength(2);
    const states = (await database.query("select id,status from public.venue_bookings where id = any($1::uuid[]) order by id", [[first.id,second.id]])).rows;
    expect(states).toHaveLength(2);
    expect(states).toEqual(expect.arrayContaining([{ id: first.id, status: "approved" }, { id: second.id, status: "pending" }]));
    expect((await database.query("select count(*)::int n from public.notifications where recipient_id = $1 and type = 'venue_conflict_flagged'", [staff.id])).rows[0].n).toBeGreaterThan(0);
    expect((await recheckVenueConflicts(venueId)).activeCount).toBe(2);
    expect((await recheckAllVenueConflicts()).flaggedCount).toBe(0);
    await updateVenue(venueId, venue());
    expect((await listFlaggedBookingConflicts()).filter((f) => [first.id,second.id].includes(f.bookingId))).toEqual([]);
    expect((await database.query("select id,status from public.venue_bookings where id = any($1::uuid[]) order by id", [[first.id,second.id]])).rows).toEqual(states);
  });
  // SPM-88 AC1/AC5: block conflicts show their other side; only staff may recheck.
  it("lists a conflicting block and denies a coordinator's recheck", async () => {
    const item = await booking("2099-06-01T10:00", "2099-06-01T12:00", "approved");
    await database.query("insert into public.venue_unavailability (venue_id,starts_at,ends_at,reason) values ($1,'2099-06-01T12:00+08','2099-06-01T13:00+08','Integration maintenance')", [venueId]);
    await fixture.signIn(staff);
    await updateVenue(venueId, { ...venue(), turnaroundTimeMinutes: "30" });
    expect(await listFlaggedBookingConflicts()).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: item.id, eventTitle: item.title, venueId, conflictingBlockReason: "Integration maintenance" })]));
    await fixture.signIn(coordinator);
    await expect(apiFetch(`/venues/${venueId}/recheck-conflicts`, { method: "POST" })).rejects.toMatchObject({ status: 403 });
    await expect(apiFetch("/venues/recheck-conflicts", { method: "POST" })).rejects.toMatchObject({ status: 403 });
  });
});
