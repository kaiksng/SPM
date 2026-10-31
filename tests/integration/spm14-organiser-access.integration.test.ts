import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, type EventRequestFormValues } from "@spm/shared";
import { loadEventDetail } from "@/features/event-requests/services/event-details";
import { cancelEventRequest, listEventRequests, saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { listEventStatusHistory } from "@/features/event-requests/services/event-lifecycle";
import { loadEventFieldHistory } from "@/features/event-requests/services/field-history";
import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

// Current business states; legacy enum values belong to the SPM-12 decision.
const statusPaths = {
  draft: [],
  requested: ["requested"],
  planning: ["requested", "planning"],
  pending_safety_check: ["requested", "planning", "pending_safety_check"],
  confirmed: ["requested", "planning", "pending_safety_check", "confirmed"],
  completed: ["requested", "planning", "pending_safety_check", "confirmed", "completed"],
  rejected: ["requested", "rejected"],
  cancelled: ["requested", "cancelled"],
} as const;
type BusinessStatus = keyof typeof statusPaths;
type TestUser = Awaited<ReturnType<IntegrationFixture["organiser"]>>;

function draft(title = "Integration ownership event"): EventRequestFormValues {
  return {
    ...structuredClone(emptyEventRequestFormValues), title,
    purpose: "Meeting", description: "Private organiser requirements",
    expectedAttendance: "20", startsAt: "2099-04-06T10:00", endsAt: "2099-04-06T12:00",
    venue: { preferredLocation: "Bugis", minimumCapacity: "20", accessibilityNotes: "Step-free", layoutNotes: "Classroom", facilities: ["Projector"] },
  };
}

let fixture: IntegrationFixture;
let owner: TestUser;
let other: TestUser;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  owner = await fixture.organiser();
  other = await fixture.organiser();
  await fixture.signIn(owner);
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

/** Independent read oracle: failed access must leave records and audit unchanged. */
async function snapshot(id: string) {
  const { rows } = await database.query(`
    select jsonb_build_object(
      'event', to_jsonb(e),
      'venue', (select to_jsonb(v) from public.event_venue_requirements v where event_id = e.id),
      'facilities', (select jsonb_agg(to_jsonb(f) order by f.id) from public.event_required_facilities f where event_id = e.id),
      'equipment', (select jsonb_agg(to_jsonb(q) order by q.id) from public.event_equipment_requirements q where event_id = e.id),
      'registration', (select to_jsonb(r) from public.event_registration_requirements r where event_id = e.id),
      'fields', (select jsonb_agg(to_jsonb(c) order by c.id) from public.event_field_changes c where event_id = e.id),
      'statuses', (select jsonb_agg(to_jsonb(s) order by s.id) from public.event_status_history s where event_id = e.id),
      'notifications', (select jsonb_agg(to_jsonb(n) order by n.id) from public.notifications n where event_id = e.id),
      'audit', (select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_logs a where entity_id = e.id)
    ) as snapshot from public.events e where e.id = $1
  `, [id]);
  return rows[0].snapshot;
}

async function readFixture(status: BusinessStatus) {
  const values = draft();
  if (status === "completed") {
    values.startsAt = "2020-04-06T10:00";
    values.endsAt = "2020-04-06T12:00";
  }
  values.equipment = [{ id: "", equipmentItemId: await fixture.equipment(), legacyName: "", quantity: "1", requiredFrom: values.startsAt, requiredUntil: values.endsAt, notes: "Private placement notes" }];
  const id = await saveEventDraft(values);
  values.purpose = "Private revised purpose";
  await saveEventDraft(values, id); // Nonempty field history from a real save.
  const coordinator = ["planning", "pending_safety_check", "confirmed", "completed", "rejected"].includes(status)
    ? await fixture.user("event_coordinator")
    : undefined;

  // Administrative fixture preparation, never a tested business action.
  // Keep all triggers enabled and follow legal edges. This does not prove
  // coordinator assignment, readiness or safety approval workflows.
  const client = await database.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: owner.id, role: "authenticated" })]);
    for (const next of statusPaths[status]) {
      await client.query(
        "update public.events set status = $2::public.event_status, assigned_coordinator_id = $3 where id = $1",
        [id, next, coordinator?.id ?? null],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
  return { id, values };
}

describe("SPM-14: organiser ownership across services, RLS and the backend", () => {
  // SPM-14 AC1/AC3: both users have data, so an always-empty list cannot pass.
  it("lists each organiser's own events and rejects a spoofed organiser filter", async () => {
    const ownerId = await saveEventDraft(draft("Integration owner A event"));
    await fixture.signIn(other);
    const otherId = await saveEventDraft(draft("Integration owner B event"));
    expect((await listEventRequests(other.id)).map((event) => event.id)).toEqual([otherId]);
    expect(await listEventRequests(owner.id)).toEqual([]);
    await fixture.signIn(owner);
    expect((await listEventRequests(owner.id)).map((event) => event.id)).toEqual([ownerId]);
    expect(await listEventRequests(other.id)).toEqual([]);
  });

  // SPM-14 AC1/AC3: owner access persists through every current lifecycle state;
  // another organiser cannot use direct event/child/history queries to bypass it.
  it.each(Object.keys(statusPaths) as BusinessStatus[])("protects details, requirements and history for a %s event", async (status) => {
    const { id, values } = await readFixture(status);
    const before = await snapshot(id);
    expect(await listEventRequests(owner.id)).toEqual([expect.objectContaining({ id, status })]);
    expect(await loadEventDetail(id)).toMatchObject({
      id, status, organiserId: owner.id, purpose: "Private revised purpose",
      venue: { preferredLocation: "Bugis", facilities: ["Projector"] },
      equipment: [expect.objectContaining({ technicalRequirements: "Private placement notes" })],
    });
    expect(await loadEventFieldHistory(id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldName: "purpose", previousValue: "Meeting", newValue: "Private revised purpose" }),
    ]));
    expect(await listEventStatusHistory(id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ toStatus: status, changedById: owner.id }),
    ]));

    // SPM-14 AC2: ownership does not unlock terminal events for editing.
    if (["confirmed", "completed", "rejected", "cancelled"].includes(status)) {
      await expect(saveEventDraft({ ...values, title: "Integration forbidden terminal edit" }, id)).rejects.toThrow();
      expect(await snapshot(id)).toEqual(before);
    }
    await fixture.signIn(other);
    expect(await listEventRequests(owner.id)).toEqual([]);
    await expect(loadEventDetail(id)).rejects.toThrow("unavailable");
    expect(await loadEventFieldHistory(id)).toEqual([]);
    expect(await listEventStatusHistory(id)).toEqual([]);
    for (const table of ["event_venue_requirements", "event_required_facilities", "event_equipment_requirements", "event_registration_requirements"] as const) {
      const { data, error } = await supabase.from(table).select("event_id").eq("event_id", id);
      // Network/query errors must not masquerade as permission protection.
      if (error) expect(error.code).toBe("42501");
      expect(data ?? []).toEqual([]);
    }
    expect(await snapshot(id)).toEqual(before);
  });

  // SPM-14 AC2/AC3: the backend must derive identity from the caller's real
  // session, even if a request body supplies the owner's id.
  it("refuses another organiser's submission but permits the owner's submission", async () => {
    const id = await saveEventDraft(draft());
    const before = await snapshot(id);
    await fixture.signIn(other);
    await expect(apiFetch(`/events/${id}/submit`, {
      method: "POST", body: JSON.stringify({ actorId: owner.id, organiserId: owner.id }),
    })).rejects.toMatchObject({ status: 403 });
    expect(await snapshot(id)).toEqual(before);
    await fixture.signIn(owner);
    expect(await apiFetch(`/events/${id}/submit`, { method: "POST" })).toMatchObject({
      data: { eventId: id, status: "requested", assignedCoordinatorId: null },
    });
    expect((await database.query("select status, submitted_by from public.events where id = $1", [id])).rows)
      .toEqual([{ status: "requested", submitted_by: owner.id }]);
  });

  // SPM-14 AC2/AC3: organiser-request cancellation is distinct from the
  // coordinator's whole-event cancellation (SPM-45).
  it("refuses another organiser's cancellation and actor spoofing but permits the owner", async () => {
    const id = await saveEventDraft(draft());
    await apiFetch(`/events/${id}/submit`, { method: "POST" });
    const before = await snapshot(id);
    await fixture.signIn(other);
    await expect(cancelEventRequest(id)).rejects.toThrow("Only the organiser");
    const spoofed = await supabase.rpc("cancel_event_request", { p_event_id: id, p_actor_id: owner.id });
    expect(spoofed.error?.code).toBe("42501");
    expect(await snapshot(id)).toEqual(before);
    await fixture.signIn(owner);
    await cancelEventRequest(id);
    expect((await database.query("select organiser_id, status from public.events where id = $1", [id])).rows)
      .toEqual([{ organiser_id: owner.id, status: "cancelled" }]);
    expect(await listEventStatusHistory(id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ toStatus: "cancelled", changedById: owner.id }),
    ]));
  });

  // SPM-14 AC2/AC3: enforce ownership below the UI/service layer too.
  it("blocks a direct table takeover while allowing the owner's permitted draft update", async () => {
    const id = await saveEventDraft(draft());
    const before = await snapshot(id);
    await fixture.signIn(other);
    const attack = await supabase.from("events").update({
      organiser_id: other.id, title: "Integration attempted takeover",
    }).eq("id", id).select("id");
    if (attack.error) expect(attack.error.code).toBe("42501");
    expect(attack.data ?? []).toEqual([]);
    expect(await snapshot(id)).toEqual(before);
    await fixture.signIn(owner);
    const permitted = await supabase.from("events").update({ title: "Integration permitted owner update" }).eq("id", id).select("id");
    expect(permitted.error).toBeNull();
    expect(permitted.data).toEqual([{ id }]);
    expect((await loadEventDetail(id)).title).toBe("Integration permitted owner update");
  });
});
