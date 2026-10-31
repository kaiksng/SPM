import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, type VenueBlockFormValues } from "@spm/shared";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { createVenueBlock, listVenueBlocks, previewVenueBlockImpact, removeVenueBlock } from "@/features/venues/services/venue-blocks";
import { listVenueAvailability } from "@/features/venues/services/venue-availability";
import { supabase } from "@/lib/supabase-client";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

let fixture: IntegrationFixture;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let organiser: Awaited<ReturnType<IntegrationFixture["user"]>>;
let venueId: string;
let name: string;
function values(): VenueBlockFormValues { return { venueId, reasonCategory: "maintenance", reason: "Synthetic maintenance", startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00" }; }
async function stored() { return (await database.query("select id,reason,starts_at,ends_at,removed_at,removed_by from public.venue_unavailability where venue_id = $1 order by id", [venueId])).rows; }

beforeEach(async () => {
  fixture = new IntegrationFixture(); name = `Integration block venue ${randomUUID()}`; venueId = randomUUID();
  staff = await fixture.user("venue_staff"); organiser = await fixture.organiser();
  await database.query("insert into public.venues (id,name,location,capacity,operating_hours) values ($1,$2,'Block A',100,'[{\"days\":[\"mon\",\"tue\"],\"opensAt\":\"08:00\",\"closesAt\":\"18:00\"}]'::jsonb)", [venueId,name]);
  await fixture.signIn(staff);
});
afterEach(async () => { try { await database.query("delete from public.events where organiser_id = $1", [organiser.id]); await database.query("delete from public.venue_unavailability where venue_id = $1", [venueId]); await database.query("delete from public.venues where id = $1", [venueId]); } finally { await fixture.cleanup(); } });
afterAll(async () => { try { expect((await database.query("select count(*)::int n from public.venues where name like 'Integration block venue %'")).rows[0].n).toBe(0); await assertNoFixtureResidue(); } finally { await database.end(); } });

describe("SPM-19 operational blocks without booking overlap", () => {
  // SPM-19 AC1–AC3: Singapore time, persisted fields, availability and history.
  it("creates and removes a future block while keeping current and past history", async () => {
    const pastId = randomUUID();
    await database.query("insert into public.venue_unavailability (id,venue_id,reason_category,reason,starts_at,ends_at) values ($1,$2,'safety','Historic test block','2020-04-06T10:00+08','2020-04-06T12:00+08')", [pastId,venueId]);
    const { blockId, affected } = await createVenueBlock(values());
    expect(affected).toEqual([]);
    const persisted = await stored();
    expect(persisted).toEqual(expect.arrayContaining([expect.objectContaining({ id: blockId, reason: "Synthetic maintenance", starts_at: new Date("2099-04-06T02:00:00.000Z"), ends_at: new Date("2099-04-06T04:00:00.000Z"), removed_at: null })]));
    expect(await listVenueBlocks(venueId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pastId, reason: "Historic test block", removedAt: null }),
      expect.objectContaining({ id: blockId, reasonCategory: "maintenance", startsAt: "2099-04-06T02:00:00+00:00", endsAt: "2099-04-06T04:00:00+00:00", removedAt: null }),
    ]));
    expect(await listVenueAvailability(venueId, staff.id)).toEqual(expect.arrayContaining([expect.objectContaining({ id: blockId, type: "blocked" })]));
    await removeVenueBlock(blockId);
    expect(await listVenueBlocks(venueId)).toEqual(expect.arrayContaining([expect.objectContaining({ id: blockId, removedAt: expect.any(String), removedBy: staff.id })]));
    expect((await listVenueAvailability(venueId, staff.id)).some((p) => p.id === blockId)).toBe(false);
    expect((await stored()).find((row) => row.id === blockId)).toMatchObject({ removed_by: staff.id, removed_at: expect.any(Date) });
  });
  // SPM-19 AC4/AC5: validation identifies the field and never writes a block.
  it.each([
    ["venueId", "not-a-uuid"], ["reason", ""], ["startsAt", ""], ["endsAt", ""],
    ["endsAt", "2099-04-06T10:00"], ["endsAt", "2099-04-06T09:00"],
  ] as const)("rejects invalid %s=%s without changing stored blocks", async (field, invalid) => {
    const before = await stored();
    await expect(createVenueBlock({ ...values(), [field]: invalid })).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ path: [field] })]) });
    expect(await stored()).toEqual(before);
  });
  // SPM-19 AC1/AC2: the real database rejects a non-staff actor.
  it("denies a non-staff organiser's create and remove attempts", async () => {
    const { blockId } = await createVenueBlock(values());
    const before = await stored();
    await fixture.signIn(organiser);
    await expect(createVenueBlock({ ...values(), startsAt: "2099-04-07T10:00", endsAt: "2099-04-07T12:00" })).rejects.toThrow(/venue staff/i);
    const denied = await supabase.rpc("remove_venue_block", { p_block_id: blockId });
    expect(denied.error?.code).toBe("42501");
    expect(await stored()).toEqual(before);
  });
});

// Jira export (6) still contains the older rejection scenario. The user asked
// us to test the confirmed SPM-83 behaviour while Jira wording is updated.
describe("SPM-19 overlapping bookings under the requested SPM-83 behaviour", () => {
  it("previews, saves and flags pending and approved bookings without cancelling them", async () => {
    const coordinator = await fixture.user("event_coordinator");
    const records: Array<{ id: string; eventId: string; status: "pending" | "approved" }> = [];
    for (const [startsAt, endsAt, status] of [["2099-04-06T10:00", "2099-04-06T11:00", "pending"], ["2099-04-06T11:00", "2099-04-06T12:00", "approved"]] as const) {
      await fixture.signIn(organiser);
      const eventId = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title: `Integration block event ${randomUUID()}`, purpose: "Meeting", description: "Synthetic event", expectedAttendance: "20", startsAt, endsAt });
      const client = await database.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: organiser.id, role: "authenticated" })]);
        await client.query("update public.events set status = 'requested' where id = $1", [eventId]);
        await client.query("update public.events set status = 'planning', assigned_coordinator_id = $2 where id = $1", [eventId, coordinator.id]);
        await client.query("commit");
      } catch (error) { await client.query("rollback"); throw error; } finally { client.release(); }
      const id = randomUUID();
      await database.query("insert into public.venue_bookings (id,event_id,venue_id,requested_by,starts_at,ends_at,status) values ($1,$2,$3,$4,$5::timestamp at time zone 'Asia/Singapore',$6::timestamp at time zone 'Asia/Singapore',$7::public.request_status)", [id,eventId,venueId,coordinator.id,startsAt,endsAt,status]);
      records.push({ id, eventId, status });
    }
    await fixture.signIn(staff);
    const preview = await previewVenueBlockImpact(values());
    expect(preview.map((item) => item.bookingId)).toEqual(expect.arrayContaining(records.map((item) => item.id)));
    expect(await stored()).toEqual([]); // preview is read-only
    const { blockId, affected } = await createVenueBlock(values());
    expect(affected.map((item) => item.bookingId)).toEqual(expect.arrayContaining(records.map((item) => item.id)));
    expect(await stored()).toEqual([expect.objectContaining({ id: blockId, removed_at: null })]);
    expect((await database.query("select booking_id from public.venue_booking_disruptions where block_id = $1 and cleared_at is null", [blockId])).rows).toEqual(expect.arrayContaining(records.map((item) => ({ booking_id: item.id }))));
    expect((await database.query("select id,status from public.venue_bookings where id = any($1::uuid[])", [records.map((item) => item.id)])).rows).toEqual(expect.arrayContaining(records.map((item) => ({ id: item.id, status: item.status }))));
    expect((await database.query("select event_id from public.notifications where recipient_id = $1 and type = 'venue_booking_disrupted'", [coordinator.id])).rows).toEqual(expect.arrayContaining(records.map((item) => ({ event_id: item.eventId }))));
  });
});
