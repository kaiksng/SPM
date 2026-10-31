import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, type VenueSearchValues } from "@spm/shared";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { searchAvailableVenues } from "@/features/venues/services/venue-search";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

let fixture: IntegrationFixture;
let organiser: Awaited<ReturnType<IntegrationFixture["user"]>>;
let coordinator: Awaited<ReturnType<IntegrationFixture["user"]>>;
let other: Awaited<ReturnType<IntegrationFixture["user"]>>;
let venueIds: string[];
let eventId: string;
const search: VenueSearchValues = { startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00", minimumCapacity: "40", location: "Central Area", layout: "Theatre", facilities: ["Projector", "Wi-Fi"], accessibility: "wheelchair" };

async function makeEvent() {
  await fixture.signIn(organiser);
  const id = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title: `Integration venue search ${randomUUID()}`, purpose: "Meeting", description: "Synthetic event", expectedAttendance: "40", startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00" });
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: organiser.id, role: "authenticated" })]);
    await client.query("update public.events set status = 'requested' where id = $1", [id]);
    await client.query("update public.events set status = 'planning', assigned_coordinator_id = $2 where id = $1", [id, coordinator.id]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return id;
}
async function venue(options: { capacity?: number; area?: string; layout?: string; facilities?: string[]; accessibility?: string; opens?: string } = {}) {
  const id = randomUUID(); venueIds.push(id);
  const hours = [{ days: ["mon", "tue"], opensAt: options.opens ?? "08:00", closesAt: "18:00" }];
  await database.query("insert into public.venues (id,name,location,area_tags,capacity,operating_hours,accessibility_notes,description,setup_time_minutes,turnaround_time_minutes) values ($1,$2,'Block A',$3,$4,$5::jsonb,$6,'Synthetic venue',30,45)", [id, `Integration search venue ${id}`, [options.area ?? "Central Area"], options.capacity ?? 80, JSON.stringify(hours), options.accessibility ?? "wheelchair accessible"]);
  await database.query("insert into public.venue_layouts (venue_id,layout_name) values ($1,$2::public.room_layout)", [id, options.layout ?? "Theatre"]);
  for (const facility of options.facilities ?? ["Projector", "Wi-Fi"]) await database.query("insert into public.venue_facilities (venue_id,facility_name) values ($1,$2)", [id,facility]);
  return id;
}
beforeEach(async () => { fixture = new IntegrationFixture(); venueIds = []; organiser = await fixture.organiser(); coordinator = await fixture.user("event_coordinator"); other = await fixture.user("event_coordinator"); eventId = await makeEvent(); });
afterEach(async () => { try { await database.query("delete from public.events where organiser_id = $1", [organiser.id]); await database.query("delete from public.venue_unavailability where venue_id = any($1::uuid[])", [venueIds]); await database.query("delete from public.venues where id = any($1::uuid[])", [venueIds]); } finally { await fixture.cleanup(); } });
afterAll(async () => { try { expect((await database.query("select count(*)::int n from public.venues where name like 'Integration search venue %'")).rows[0].n).toBe(0); await assertNoFixtureResidue(); } finally { await database.end(); } });

describe("SPM-21 manual venue search", () => {
  // SPM-21 AC2/AC3/AC5: each filter excludes a distinct unsuitable venue.
  it("requires every specified criterion and returns suitability details", async () => {
    const match = await venue();
    await venue({ capacity: 39 }); await venue({ area: "East" }); await venue({ layout: "Banquet" }); await venue({ facilities: ["Projector"] }); await venue({ accessibility: "stairs only" });
    await fixture.signIn(coordinator);
    const result = await searchAvailableVenues(eventId, search);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: match, capacity: 80, description: "Synthetic venue", accessibilityNotes: "wheelchair accessible", facilities: ["Projector", "Wi-Fi"], layouts: ["Theatre"], setupTimeMinutes: 30, turnaroundTimeMinutes: 45, availabilityStatus: "available" });
    const broad = await searchAvailableVenues(eventId, { ...search, minimumCapacity: "1", location: "", layout: "", facilities: [], accessibility: "" });
    expect(broad).toHaveLength(6);
    await expect(searchAvailableVenues(eventId, { ...search, minimumCapacity: "0" })).rejects.toThrow();
    await expect(searchAvailableVenues(eventId, { ...search, endsAt: search.startsAt })).rejects.toThrow();
  });
  // SPM-21 AC1/AC4/AC6: an active request does not prevent search; occupied
  // and blocked venues are excluded, and changing dates does not edit the event.
  it("excludes occupied and closed venues while preserving the event schedule", async () => {
    const free = await venue(), pending = await venue(), confirmed = await venue(), blocked = await venue();
    await venue({ opens: "10:00" });
    const pendingEvent = await makeEvent(), confirmedEvent = await makeEvent();
    await database.query("insert into public.venue_bookings (event_id,venue_id,requested_by,starts_at,ends_at,status) values ($1,$2,$3,'2099-04-06T10:00+08','2099-04-06T12:00+08','pending'),($4,$5,$3,'2099-04-06T10:00+08','2099-04-06T12:00+08','approved')", [pendingEvent,pending,coordinator.id,confirmedEvent,confirmed]);
    await database.query("insert into public.venue_unavailability (venue_id,starts_at,ends_at,reason) values ($1,'2099-04-06T10:00+08','2099-04-06T12:00+08','Maintenance')", [blocked]);
    const before = (await database.query("select starts_at, ends_at from public.events where id = $1", [pendingEvent])).rows[0];
    await fixture.signIn(coordinator);
    expect((await searchAvailableVenues(pendingEvent, search)).map((v) => v.id)).toEqual([free]);
    const nextDay = await searchAvailableVenues(pendingEvent, { ...search, startsAt: "2099-04-07T10:00", endsAt: "2099-04-07T12:00" });
    expect(nextDay.map((v) => v.id)).toEqual(expect.arrayContaining([free,pending,confirmed,blocked]));
    expect((await database.query("select starts_at, ends_at from public.events where id = $1", [pendingEvent])).rows[0]).toEqual(before);
    await fixture.signIn(other);
    await expect(searchAvailableVenues(pendingEvent, search)).rejects.toThrow(/not found|not assigned/i);
  });
});
