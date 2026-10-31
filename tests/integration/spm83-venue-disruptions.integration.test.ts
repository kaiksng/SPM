import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, type VenueBlockFormValues } from "@spm/shared";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { loadEventReadiness } from "@/features/safety-check/services/event-readiness";
import { createVenueBlock, previewVenueBlockImpact, removeVenueBlock, shortenVenueBlock } from "@/features/venues/services/venue-blocks";
import { checkVenueBookingAvailability, requestReplacementVenue, submitVenueBookingRequest } from "@/features/venues/services/venue-bookings";
import { listVenueDisruptionsForCoordinator } from "@/features/venues/services/venue-disruptions";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

let fixture: IntegrationFixture;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let organiser: Awaited<ReturnType<IntegrationFixture["user"]>>;
let coordinator: Awaited<ReturnType<IntegrationFixture["user"]>>;
let other: Awaited<ReturnType<IntegrationFixture["user"]>>;
let safety: Awaited<ReturnType<IntegrationFixture["user"]>>;
let venueId: string, replacementVenueId: string, name: string;
let stop: (() => Promise<void>) | undefined;
function block(): VenueBlockFormValues { return { venueId, reasonCategory: "maintenance", reason: "Integration aircon repair", startsAt: "2099-04-06T10:45", endsAt: "2099-04-06T14:00" }; }
async function event(startsAt: string, endsAt: string, status: "planning" | "pending_safety_check" = "planning") {
  await fixture.signIn(organiser);
  const title = `Integration disruption event ${randomUUID()}`;
  const id = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title, purpose: "Meeting", description: "Synthetic event", expectedAttendance: "20", startsAt, endsAt });
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: organiser.id, role: "authenticated" })]);
    await client.query("update public.events set status = 'requested' where id = $1", [id]);
    await client.query("update public.events set status = 'planning', assigned_coordinator_id = $2 where id = $1", [id, coordinator.id]);
    if (status === "pending_safety_check") await client.query("update public.events set status = 'pending_safety_check' where id = $1", [id]);
    await client.query("commit");
  } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
  return { id, title, startsAt, endsAt };
}
async function booking(item: Awaited<ReturnType<typeof event>>, status: "pending" | "approved" | "on_hold") {
  const id: string = randomUUID();
  await database.query("insert into public.venue_bookings (id,event_id,venue_id,requested_by,starts_at,ends_at,status,expires_at,is_main_venue) values ($1,$2,$3,$4,$5::timestamp at time zone 'Asia/Singapore',$6::timestamp at time zone 'Asia/Singapore',$7::public.request_status,$8,true)", [id,item.id,venueId,coordinator.id,item.startsAt,item.endsAt,status,status === "on_hold" ? "2098-01-01T00:00:00Z" : null]);
  return { ...item, bookingId: id, bookingStatus: status };
}
beforeAll(async () => { stop = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture(); venueId = randomUUID(); replacementVenueId = randomUUID(); name = `Integration disruption venue ${randomUUID()}`;
  staff = await fixture.user("venue_staff"); organiser = await fixture.organiser(); coordinator = await fixture.user("event_coordinator"); other = await fixture.user("event_coordinator"); safety = await fixture.user("safety_officer");
  await database.query("insert into public.venues (id,name,location,area_tags,capacity,operating_hours,setup_time_minutes,turnaround_time_minutes) values ($1,$2,'Block A',array['Central Area'],100,'[{\"days\":[\"mon\",\"tue\"],\"opensAt\":\"08:00\",\"closesAt\":\"18:00\"}]'::jsonb,30,45)", [venueId,name]);
  await database.query("insert into public.venues (id,name,location,area_tags,capacity,operating_hours) values ($1,$2,'Block A',array['Central Area'],100,'[{\"days\":[\"mon\",\"tue\"],\"opensAt\":\"08:00\",\"closesAt\":\"18:00\"}]'::jsonb)", [replacementVenueId, `${name} replacement`]);
});
afterEach(async () => { try { await database.query("delete from public.events where organiser_id = $1", [organiser.id]); await database.query("delete from public.venue_unavailability where venue_id = $1", [venueId]); await database.query("delete from public.venues where id = any($1::uuid[])", [[venueId,replacementVenueId]]); } finally { await fixture.cleanup(); } });
afterAll(async () => { try { await stop?.(); expect((await database.query("select count(*)::int n from public.venues where name like 'Integration disruption venue %'")).rows[0].n).toBe(0); await assertNoFixtureResidue(); } finally { await database.end(); } });

describe("SPM-83 venue disruption lifecycle", () => {
  // SPM-83 AC1–AC3, AC5–AC11, AC13: previews and saves the actual block,
  // preserving planning events and returning an event in safety review to planning.
  it("flags buffered bookings and active holds, notifies coordinators, and blocks new requests", async () => {
    const first = await booking(await event("2099-04-06T10:00", "2099-04-06T11:00"), "pending");
    const second = await booking(await event("2099-04-06T12:00", "2099-04-06T13:00", "pending_safety_check"), "approved");
    const held = await booking(await event("2099-04-06T14:00", "2099-04-06T15:00"), "on_hold");
    const candidate = await event("2099-04-06T16:15", "2099-04-06T16:30");
    // Prepared approval evidence makes history preservation non-vacuous.
    await database.query("insert into public.event_decisions (event_id,decided_by,decision,rationale) values ($1,$2,'approved','Synthetic prior approval')", [first.id,coordinator.id]);
    const approvalHistory = (await database.query("select to_jsonb(d) item from public.event_decisions d where event_id = $1 order by id", [first.id])).rows;
    const bookingBefore = (await database.query("select to_jsonb(b) item from public.venue_bookings b where id = any($1::uuid[]) order by id", [[first.bookingId,second.bookingId,held.bookingId]])).rows;
    const planningHistory = (await database.query("select from_status,to_status,changed_by from public.event_status_history where event_id = $1 order by id", [first.id])).rows;
    await fixture.signIn(staff);
    const preview = await previewVenueBlockImpact(block());
    expect(preview.map((p) => p.bookingId)).toEqual(expect.arrayContaining([first.bookingId,second.bookingId,held.bookingId]));
    expect((await database.query("select count(*)::int n from public.venue_unavailability where venue_id = $1", [venueId])).rows[0].n).toBe(0);
    const result = await createVenueBlock(block());
    expect(result.affected.map((p) => p.bookingId)).toEqual(expect.arrayContaining([first.bookingId,second.bookingId,held.bookingId]));
    expect((await database.query("select reason_category,reason from public.venue_unavailability where id = $1", [result.blockId])).rows).toEqual([{ reason_category: "maintenance", reason: "Integration aircon repair" }]);
    expect((await database.query("select booking_id from public.venue_booking_disruptions where block_id = $1 and cleared_at is null", [result.blockId])).rows).toEqual(expect.arrayContaining([first,second,held].map((b) => ({ booking_id: b.bookingId }))));
    expect((await database.query("select id,status from public.venue_bookings where id = any($1::uuid[])", [[first.bookingId,second.bookingId,held.bookingId]])).rows).toEqual(expect.arrayContaining([first,second,held].map((b) => ({ id: b.bookingId, status: b.bookingStatus }))));
    expect((await database.query("select status from public.events where id = $1", [first.id])).rows[0].status).toBe("planning");
    expect((await database.query("select status from public.events where id = $1", [second.id])).rows[0].status).toBe("planning");
    expect((await database.query("select from_status,to_status,changed_by from public.event_status_history where event_id = $1 order by id", [first.id])).rows).toEqual(planningHistory);
    expect((await database.query("select to_jsonb(d) item from public.event_decisions d where event_id = $1 order by id", [first.id])).rows).toEqual(approvalHistory);
    expect((await database.query("select to_jsonb(b) item from public.venue_bookings b where id = any($1::uuid[]) order by id", [[first.bookingId,second.bookingId,held.bookingId]])).rows).toEqual(bookingBefore);
    const notices = (await database.query("select event_id,message from public.notifications where recipient_id = $1 and type = 'venue_booking_disrupted'", [coordinator.id])).rows;
    expect(notices).toHaveLength(3);
    for (const [item, start, end] of [[first, "10:00", "11:00"], [second, "12:00", "13:00"], [held, "14:00", "15:00"]] as const) {
      const notice = notices.find((n) => n.event_id === item.id);
      expect(notice?.message).toContain(item.title); expect(notice?.message).toContain(name);
      expect(notice?.message).toContain(`06 Apr 2099 ${start}`); expect(notice?.message).toContain(`06 Apr 2099 ${end}`);
      expect(notice?.message).toContain("06 Apr 2099 10:45"); expect(notice?.message).toContain("06 Apr 2099 14:00");
      expect(notice?.message).toContain("Integration aircon repair"); expect(notice?.message).toContain("Alternative arrangements are required"); expect(notice?.message).toContain("has not been cancelled");
    }
    expect((await database.query("select count(*)::int n from public.notifications where recipient_id = $1 and event_id = $2 and title = 'Safety check interrupted by a venue disruption'", [safety.id,second.id])).rows[0].n).toBe(1);
    await createVenueBlock({ ...block(), startsAt: "2099-04-06T16:00", endsAt: "2099-04-06T17:00" });
    await fixture.signIn(coordinator);
    expect((await listVenueDisruptionsForCoordinator()).map((d) => d.bookingId)).toEqual(expect.arrayContaining([first.bookingId,second.bookingId,held.bookingId]));
    expect((await loadEventReadiness(second.id)).venues).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: second.bookingId, status: "needs_review" })]));
    expect((await checkVenueBookingAvailability(replacementVenueId,candidate.id)).available).toBe(true);
    expect(await checkVenueBookingAvailability(venueId,candidate.id)).toMatchObject({ available: false, reason: expect.stringMatching(/unavailable/i) });
    await expect(submitVenueBookingRequest(candidate.id,venueId)).rejects.toThrow(/unavailable/i);
    expect((await database.query("select count(*)::int n from public.venue_bookings where event_id = $1", [candidate.id])).rows[0].n).toBe(0);
    await fixture.signIn(other);
    expect(await listVenueDisruptionsForCoordinator()).toEqual([]);
  });
  // SPM-83 AC4/AC11/AC12: shortening and removal clear the right disruptions
  // and coordinator reads show replacement-required and resolved states.
  it("clears only bookings outside a shortened block and then resolves the remainder", async () => {
    const first = await booking(await event("2099-04-06T10:00", "2099-04-06T11:00"), "approved");
    const second = await booking(await event("2099-04-06T12:00", "2099-04-06T13:00"), "pending");
    await fixture.signIn(staff);
    const { blockId } = await createVenueBlock(block());
    await fixture.signIn(coordinator);
    expect(await listVenueDisruptionsForCoordinator()).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: first.bookingId, state: "replacement_required" }),expect.objectContaining({ bookingId: second.bookingId, state: "replacement_required" })]));
    const replacementId = await requestReplacementVenue(second.bookingId, replacementVenueId);
    expect(await listVenueDisruptionsForCoordinator()).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: second.bookingId, state: "replacement_requested", replacementBookingId: replacementId })]));
    await fixture.signIn(staff);
    await expect(shortenVenueBlock(blockId,"2099-04-06T12:00","2099-04-06T12:00")).rejects.toThrow(/end time/i);
    await shortenVenueBlock(blockId,"2099-04-06T12:00","2099-04-06T14:00");
    await fixture.signIn(coordinator);
    expect(await listVenueDisruptionsForCoordinator()).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: first.bookingId, state: "resolved" }),expect.objectContaining({ bookingId: second.bookingId, state: "replacement_requested" })]));
    await fixture.signIn(staff);
    await removeVenueBlock(blockId);
    await fixture.signIn(coordinator);
    expect(await listVenueDisruptionsForCoordinator()).toEqual(expect.arrayContaining([expect.objectContaining({ bookingId: first.bookingId, state: "resolved" }),expect.objectContaining({ bookingId: second.bookingId, state: "resolved" })]));
    expect((await database.query("select count(*)::int n from public.notifications where recipient_id = $1 and type = 'venue_disruption_cleared' and event_id = any($2::uuid[])", [coordinator.id,[first.id,second.id]])).rows[0].n).toBe(2);
  });
});
