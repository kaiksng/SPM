import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, type EventRequestFormValues } from "@spm/shared";
import { deleteEventDraft, listEventRequests, loadEventDraft, saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { supabase } from "@/lib/supabase-client";
import { assertNoFixtureResidue, database, DraftFixture } from "./fixtures";

function draft(title = "Integration draft"): EventRequestFormValues {
  return { ...structuredClone(emptyEventRequestFormValues), title };
}

async function storedEvent(id: string) {
  const { rows } = await database.query("select * from public.events where id = $1", [id]);
  return rows[0];
}

let fixture: DraftFixture;
let owner: Awaited<ReturnType<DraftFixture["organiser"]>>;
beforeEach(async () => {
  fixture = new DraftFixture();
  owner = await fixture.organiser();
  await fixture.signIn(owner);
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try { await assertNoFixtureResidue(); }
  finally { await database.end(); }
});

describe("SPM-2: real draft service / Auth / PostgREST / Postgres", () => {
  // SPM-2 AC1, AC3: an incomplete draft persists without entering submission/planning.
  it("saves only a name, stays Draft and creates no downstream work", async () => {
    const id = await saveEventDraft(draft());
    expect(await storedEvent(id)).toMatchObject({
      title: "Integration draft", organiser_id: owner.id, status: "draft",
      purpose: null, starts_at: null, submitted_at: null, assigned_coordinator_id: null,
    });
    expect((await loadEventDraft(id)).values).toMatchObject({ title: "Integration draft", purpose: "", startsAt: "", equipment: [] });
    expect(await listEventRequests(owner.id)).toEqual([expect.objectContaining({ id, status: "draft", assignedCoordinatorId: null })]);
    const { rows } = await database.query(`
      select
        (select count(*)::int from public.venue_bookings where event_id = $1) as bookings,
        (select count(*)::int from public.equipment_reservations where event_id = $1) as reservations,
        (select count(*)::int from public.event_decisions where event_id = $1) as decisions,
        (select count(*)::int from public.notifications where event_id = $1) as notifications,
        (select count(*)::int from public.event_safety_check_submissions where event_id = $1) as safety,
        (select count(*)::int from public.event_status_history where event_id = $1 and to_status <> 'draft') as transitions
    `, [id]);
    expect(Object.values(rows[0])).toEqual([0, 0, 0, 0, 0, 0]);
  });

  // SPM-2 AC2: values pass through real serializers, RPC writes and relational loaders.
  it("reopens the latest rich values, including Singapore times and equipment", async () => {
    const id = await saveEventDraft(draft());
    const equipmentId = await fixture.equipment();
    const values: EventRequestFormValues = {
      ...draft("Integration revised draft"), purpose: "Meeting", description: "Latest saved description",
      eventType: "Workshop", expectedAttendance: "40",
      startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00",
      venue: { preferredLocation: "Bugis", minimumCapacity: "50", accessibilityNotes: "Step-free", layoutNotes: "Classroom", facilities: ["Projector", "Microphone"] },
      equipment: [{ id: "", equipmentItemId: equipmentId, legacyName: "", quantity: "2", requiredFrom: "2099-04-06T09:00", requiredUntil: "2099-04-06T13:00", notes: "HDMI" }],
      registration: { required: true, opensAt: "", closesAt: "", capacity: "", waitlistEnabled: false },
      requirementsAcknowledged: true,
    };
    expect(await saveEventDraft(values, id)).toBe(id);
    const loaded = await loadEventDraft(id);
    expect(loaded.status).toBe("draft");
    expect(loaded.values).toEqual({ ...values, equipment: [{ ...values.equipment[0], id: expect.any(String) }] });
    const stored = await storedEvent(id);
    expect(stored.starts_at.toISOString()).toBe("2099-04-06T02:00:00.000Z");
    expect(stored.ends_at.toISOString()).toBe("2099-04-06T04:00:00.000Z");
    const { rows } = await database.query("select quantity, required_from, required_until from public.event_equipment_requirements where event_id = $1", [id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(2);
    expect(rows[0].required_from.toISOString()).toBe("2099-04-06T01:00:00.000Z");
    expect(rows[0].required_until.toISOString()).toBe("2099-04-06T05:00:00.000Z");
  });

  // SPM-2 AC2: a later save replaces associated values rather than retaining stale rows.
  it("replaces removed facilities and equipment on another save", async () => {
    const equipmentId = await fixture.equipment();
    const values = draft();
    values.venue.facilities = ["Projector", "Microphone"];
    values.equipment = [{ id: "", equipmentItemId: equipmentId, legacyName: "", quantity: "2", requiredFrom: "2099-04-06T09:00", requiredUntil: "2099-04-06T13:00", notes: "HDMI" }];
    const id = await saveEventDraft(values);
    values.title = "Integration latest draft";
    values.venue.facilities = ["Microphone"];
    values.equipment = [];
    await saveEventDraft(values, id);
    const loaded = await loadEventDraft(id);
    expect(loaded.values.title).toBe("Integration latest draft");
    expect(loaded.values.venue.facilities).toEqual(["Microphone"]);
    expect(loaded.values.equipment).toEqual([]);
    expect((await database.query("select * from public.event_equipment_requirements where event_id = $1", [id])).rows).toEqual([]);
  });

  // SPM-2 AC4: confirmation belongs to the UI; this checks the real confirmed action.
  it("deletes the owner's draft and cascades its associated draft records", async () => {
    const values = draft();
    values.venue.facilities = ["Projector"];
    values.equipment = [{ id: "", equipmentItemId: await fixture.equipment(), legacyName: "", quantity: "1", requiredFrom: "2099-04-06T09:00", requiredUntil: "2099-04-06T13:00", notes: "Cascade fixture" }];
    const id = await saveEventDraft(values);
    // Prove the child rows exist first so cascade assertions cannot pass vacuously.
    for (const table of ["event_venue_requirements", "event_required_facilities", "event_registration_requirements", "event_equipment_requirements"]) {
      expect((await database.query(`select * from public.${table} where event_id = $1`, [id])).rows).toHaveLength(1);
    }
    await deleteEventDraft(id);
    expect(await storedEvent(id)).toBeUndefined();
    for (const table of ["event_venue_requirements", "event_required_facilities", "event_registration_requirements", "event_equipment_requirements", "event_status_history"]) {
      expect((await database.query(`select * from public.${table} where event_id = $1`, [id])).rows).toEqual([]);
    }
    await expect(loadEventDraft(id)).rejects.toThrow("unavailable");
    expect(await listEventRequests(owner.id)).toEqual([]);
  });

  // SPM-2 AC6: RLS is tested with a real second user's JWT, never a service-role action.
  it("denies another organiser's read, update and delete without altering the draft", async () => {
    const original = draft();
    original.venue.facilities = ["Projector"];
    const id = await saveEventDraft(original);
    const other = await fixture.organiser();
    await fixture.signIn(other);
    expect(await listEventRequests(owner.id)).toEqual([]);
    await expect(loadEventDraft(id)).rejects.toThrow("unavailable");
    for (const table of ["event_venue_requirements", "event_required_facilities", "event_registration_requirements"] as const) {
      const { data } = await supabase.from(table).select("event_id").eq("event_id", id);
      expect(data ?? []).toEqual([]);
    }
    await expect(saveEventDraft(draft("Integration forbidden change"), id)).rejects.toThrow();
    await expect(deleteEventDraft(id)).rejects.toThrow();
    expect(await storedEvent(id)).toMatchObject({ title: "Integration draft", organiser_id: owner.id, status: "draft" });
    await fixture.signIn(owner);
    expect((await loadEventDraft(id)).values.title).toBe("Integration draft");
    expect((await loadEventDraft(id)).values.venue.facilities).toEqual(["Projector"]);
  });

  // SPM-2 AC6: no session must not expose protected rows or permit mutations.
  it("denies an anonymous read, update and delete without altering the draft", async () => {
    const original = draft();
    original.venue.facilities = ["Projector"];
    const id = await saveEventDraft(original);
    await supabase.auth.signOut();
    await expect(loadEventDraft(id)).rejects.toThrow("unavailable");
    for (const table of ["event_venue_requirements", "event_required_facilities", "event_registration_requirements"] as const) {
      const { data } = await supabase.from(table).select("event_id").eq("event_id", id);
      expect(data ?? []).toEqual([]);
    }
    await expect(saveEventDraft(draft("Integration anonymous change"), id)).rejects.toThrow();
    await expect(deleteEventDraft(id)).rejects.toThrow();
    expect(await storedEvent(id)).toMatchObject({ title: "Integration draft", organiser_id: owner.id });
    expect((await database.query("select facility_name from public.event_required_facilities where event_id = $1", [id])).rows).toEqual([{ facility_name: "Projector" }]);
  });

  // SPM-2 AC2: client rejection and database rejection both retain the last successful save.
  it("preserves saved parent and child values when validation or the database rejects a save", async () => {
    const values = draft();
    values.venue.facilities = ["Projector"];
    const id = await saveEventDraft(values);
    await expect(saveEventDraft({ ...values, title: "" }, id)).rejects.toThrow();
    const rejected = { ...values, title: "Integration should roll back", venue: { ...values.venue, facilities: ["Microphone"] },
      equipment: [{ id: "", equipmentItemId: randomUUID(), legacyName: "", quantity: "2", requiredFrom: "2099-04-06T09:00", requiredUntil: "2099-04-06T13:00", notes: "" }] };
    await expect(saveEventDraft(rejected, id)).rejects.toThrow();
    expect(await storedEvent(id)).toMatchObject({ title: "Integration draft" });
    const loaded = await loadEventDraft(id);
    expect(loaded.values.venue.facilities).toEqual(["Projector"]);
    expect(loaded.values.equipment).toEqual([]);
  });
});

// Operational probe: intentionally fail after a real write to verify afterEach
// and runner teardown. Not part of the normal acceptance suite.
if (process.env.INTEGRATION_FAILURE_PROBE === "1") {
  it("intentional failure after a write still cleans all fixtures", async () => {
    await saveEventDraft(draft("Integration failure probe"));
    throw new Error("INTENTIONAL_CLEANUP_PROBE");
  });
}
