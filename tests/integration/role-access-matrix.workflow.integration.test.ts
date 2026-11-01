import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assignEventCoordinator } from "@/features/event-requests/services/all-events";
import { requestClarification, listClarifications, resolveClarification, respondToClarification } from "@/features/event-requests/services/clarifications";
import { decideEvent, listEventDecisions } from "@/features/event-requests/services/decisions";
import { listEventChangeRequests, submitEventChangeRequest } from "@/features/event-requests/services/change-requests";
import { loadEventDetail } from "@/features/event-requests/services/event-details";
import { listEventStatusHistory } from "@/features/event-requests/services/event-lifecycle";
import { createEquipmentItem } from "@/features/equipment/services/equipment-inventory";
import { loadAttendeeEventDetail } from "@/features/registrations/services/attendee-event";
import { decideEventSafetyCheck } from "@/features/safety-check/services/safety-check-decisions";
import { loadSafetyReviewDetails, submitEventForSafetyCheck } from "@/features/safety-check/services/event-readiness";
import { saveVenueSafetyChecks } from "@/features/safety-check/services/safety-plan";
import { decideVenueBookingRequest, listVenueBookingsForEvent, submitVenueBookingRequest } from "@/features/venues/services/venue-bookings";
import { supabase } from "@/lib/supabase-client";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";
import {
  AREA_VENUE, confirmedEvent, createActors, DEFAULT_WINDOW, eventSnapshot, planningEvent, SAFETY_CHECKS, submitRequestedEvent,
} from "./support/workflow";

// Role-access matrix (SPM-15, 16, 17, 48, 49, 77). One table of who may read
// and do what, checked against the real database and backend. Every denial has
// a positive control so an empty or broken resource cannot fake a pass.
// Landing pages per role are proved in the SPM-13 login suite; the coordinator's
// own list is proved in intake-to-planning; redirect text is UI-only.
//
// Expectations: organiser-own, assigned/any coordinator, Lead, Venue Staff and
// Technical Support follow today's can_view_event rules; other organisers, the
// Safety Officer (outside Pending Safety Check) and attendees follow the
// acceptance criteria (no internal planning data).

type Role = "owner" | "otherOrganiser" | "coordinatorA" | "coordinatorB" | "lead" | "staff" | "tech" | "officer" | "attendee";
const ROLES: Role[] = ["owner", "otherOrganiser", "coordinatorA", "coordinatorB", "lead", "staff", "tech", "officer", "attendee"];

let fixture: IntegrationFixture;
let stopBackend: (() => Promise<void>) | undefined;
let people: Record<Role, Awaited<ReturnType<IntegrationFixture["user"]>>>;
let planningId: string;
let confirmedId: string;

const signInAs = (role: Role) => fixture.signIn(people[role]);
const cast = () => ({ organiser: people.owner, lead: people.lead, coordinator: people.coordinatorA, staff: people.staff, officer: people.officer });

/** True when the caller gets real data back; any refusal, error or empty result is "no". */
async function sees(read: () => Promise<unknown>) {
  try {
    const value = await read();
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  } catch {
    return false;
  }
}

beforeAll(async () => {
  stopBackend = await startIntegrationBackend();
  fixture = new IntegrationFixture();
  const base = await createActors(fixture);
  people = {
    owner: base.organiser, otherOrganiser: await fixture.organiser(), coordinatorA: base.coordinatorA, coordinatorB: base.coordinatorB,
    lead: base.lead, staff: await fixture.user("venue_staff"), tech: await fixture.user("technical_support_staff"),
    officer: await fixture.user("safety_officer"), attendee: await fixture.user("attendee"),
  };

  // A Planning event holding one of each internal record.
  const { id } = await submitRequestedEvent(fixture, people.owner, "Integration matrix planning event", { ...AREA_VENUE, ...DEFAULT_WINDOW });
  planningId = id;
  await signInAs("lead");
  await assignEventCoordinator(id, people.coordinatorA.id, "");
  await signInAs("coordinatorA");
  await requestClarification(id, "Confirm the schedule", ["startsAt"]);
  const [round] = await listClarifications(id);
  await signInAs("owner");
  await respondToClarification(round.id, "Confirmed");
  await signInAs("coordinatorA");
  await resolveClarification(round.id);
  await decideEvent(id, "approved", "");
  await submitVenueBookingRequest(id, await fixture.venue(100));
  const itemId = await fixture.equipment();
  await database.query(
    `insert into public.event_equipment_requirements (event_id, equipment_item_id, equipment_name, quantity, required_from, required_until)
     values ($1, $2, 'Integration projector', 1, '2099-05-04T09:00:00+08:00', '2099-05-04T17:00:00+08:00')`, [id, itemId]);
  await signInAs("owner");
  await submitEventChangeRequest(id, { description: "Later start" }, "Venue opens later");

  // A Confirmed event, which attendees can see.
  confirmedId = (await confirmedEvent(fixture, cast(), "Integration matrix confirmed event")).id;
});

afterAll(async () => {
  try {
    await stopBackend?.();
    await fixture?.cleanup();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

/** Who should see each record. Attendees and other organisers never see internal planning data. */
const INTERNAL_VIEWERS: ReadonlySet<Role> = new Set(["owner", "coordinatorA", "coordinatorB", "lead", "staff", "tech"]);
// The change history is narrower (SPM-12 AC02): the organiser, the assigned coordinator and the Lead.
const HISTORY_VIEWERS: ReadonlySet<Role> = new Set(["owner", "coordinatorA", "lead"]);

type Probe = { name: string; read: (eventId: string) => Promise<unknown>; events: Array<"planning" | "confirmed">; viewers?: ReadonlySet<Role> };
const PROBES: Probe[] = [
  { name: "event details", read: (id) => loadEventDetail(id), events: ["planning", "confirmed"] },
  { name: "venue bookings", read: (id) => listVenueBookingsForEvent(id), events: ["planning", "confirmed"] },
  { name: "decisions", read: (id) => listEventDecisions(id), events: ["planning", "confirmed"] },
  { name: "status history", read: (id) => listEventStatusHistory(id), events: ["planning", "confirmed"], viewers: HISTORY_VIEWERS },
  { name: "equipment requirements", read: async (id) => (await supabase.from("event_equipment_requirements").select("id").eq("event_id", id)).data, events: ["planning"] },
  { name: "clarifications", read: (id) => listClarifications(id), events: ["planning"] },
  { name: "change requests", read: (id) => listEventChangeRequests(id), events: ["planning"] },
  { name: "safety review details", read: (id) => loadSafetyReviewDetails(id), events: ["confirmed"] },
];

describe("Role-access matrix: reading", () => {
  // SPM-15 (any/assigned coordinator), SPM-16, 17, 48, 77 AC2/AC3: each role sees exactly what it should.
  it.each(ROLES.filter((role) => role !== "attendee"))("%s sees only the internal records its role allows", async (role) => {
    await signInAs(role);
    const mismatches: string[] = [];
    for (const probe of PROBES) {
      for (const which of probe.events) {
        const eventId = which === "planning" ? planningId : confirmedId;
        const actual = await sees(() => probe.read(eventId));
        const expected = (probe.viewers ?? INTERNAL_VIEWERS).has(role);
        if (actual !== expected) mismatches.push(`${role} ${expected ? "should see" : "should not see"} ${probe.name} (${which}) but ${actual ? "can" : "cannot"}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  // The positive control behind every denial: the owner and a coordinator do see real data.
  it("returns real data to the permitted roles, so a denial is not just an empty resource", async () => {
    for (const role of ["owner", "coordinatorA"] as const) {
      await signInAs(role);
      for (const probe of PROBES) {
        for (const which of probe.events) {
          expect(await sees(() => probe.read(which === "planning" ? planningId : confirmedId)), `${role} ${probe.name} (${which})`).toBe(true);
        }
      }
    }
  });

  // SPM-49 AC1: an attendee can read the attendee-facing information of a Confirmed event.
  it("shows an attendee the published information of a Confirmed event only", async () => {
    await signInAs("attendee");
    expect(await loadAttendeeEventDetail(confirmedId)).toMatchObject({ id: confirmedId, status: "confirmed", title: "Integration matrix confirmed event" });
    // Not yet Confirmed: nothing is available to them at all.
    await expect(loadAttendeeEventDetail(planningId)).rejects.toThrow();
  });

  // SPM-49 AC2: before the event is Confirmed an attendee sees nothing, however they ask.
  it("denies an attendee every internal record of an event that is not yet Confirmed", async () => {
    await signInAs("attendee");
    const leaked: string[] = [];
    for (const probe of PROBES.filter((item) => item.events.includes("planning"))) {
      if (await sees(() => probe.read(planningId))) leaked.push(probe.name);
    }
    expect(leaked).toEqual([]);
  });

  // SPM-49 AC2/AC3: internal planning data is denied when the attendee asks for it directly,
  // even for a Confirmed event. Closed by 202611010010 (can_view_event no longer admits attendees).
  it("denies an attendee the internal planning data of a Confirmed event, even when asked directly", async () => {
    await signInAs("attendee");
    const leaked: string[] = [];
    for (const probe of PROBES.filter((item) => item.events.includes("confirmed"))) {
      if (await sees(() => probe.read(confirmedId))) leaked.push(probe.name);
    }
    // Direct column reads that the attendee screen never asks for.
    const row = (await supabase.from("events").select("expected_attendance, crowd_movement_plan, emergency_access_notes, restrictions_notes, equipment_placement_notes").eq("id", confirmedId).maybeSingle()).data;
    if (row && (row.expected_attendance !== null || row.crowd_movement_plan !== null || row.emergency_access_notes !== null)) leaked.push("internal event columns");
    expect(leaked).toEqual([]);
  });
});

describe("Role-access matrix: acting", () => {
  /** Every role except the authorised ones tries the action; each refusal leaves the snapshot unchanged. */
  async function denyAll(authorised: Role[], attempt: () => Promise<unknown>, snapshot: () => Promise<unknown>) {
    const before = await snapshot();
    for (const role of ROLES.filter((candidate) => !authorised.includes(candidate))) {
      await signInAs(role);
      await expect(attempt(), `${role} should be refused`).rejects.toThrow();
      expect(await snapshot(), `${role} must not change anything`).toEqual(before);
    }
  }

  // SPM-77 AC2: only the Lead assigns a coordinator.
  it("lets only the Lead assign a coordinator", async () => {
    const { id } = await submitRequestedEvent(fixture, people.owner, "Integration matrix assign event");
    await denyAll(["lead"], () => assignEventCoordinator(id, people.coordinatorA.id, ""), () => eventSnapshot(id));
    await signInAs("lead");
    await assignEventCoordinator(id, people.coordinatorA.id, "");
    expect((await database.query("select assigned_coordinator_id from public.events where id = $1", [id])).rows[0].assigned_coordinator_id).toBe(people.coordinatorA.id);
  });

  // SPM-84 AC7 / SPM-15: only the assigned coordinator decides an event.
  it("lets only the assigned coordinator decide an event request", async () => {
    const { id } = await submitRequestedEvent(fixture, people.owner, "Integration matrix decide event");
    await signInAs("lead");
    await assignEventCoordinator(id, people.coordinatorA.id, "");
    await denyAll(["coordinatorA"], () => decideEvent(id, "approved", ""), () => eventSnapshot(id));
    await signInAs("coordinatorA");
    await decideEvent(id, "approved", "");
    expect((await database.query("select status from public.events where id = $1", [id])).rows[0].status).toBe("planning");
  });

  // SPM-16: only Venue Staff decide a booking request.
  it("lets only Venue Staff decide a venue booking request", async () => {
    const { id } = await planningEvent(fixture, { organiser: people.owner, lead: people.lead, coordinator: people.coordinatorA }, "Integration matrix booking event", { ...AREA_VENUE, ...DEFAULT_WINDOW });
    const booking = await submitVenueBookingRequest(id, await fixture.venue(100));
    await denyAll(["staff"], () => decideVenueBookingRequest(booking, "approved", ""), () => eventSnapshot(id));
    await signInAs("staff");
    await decideVenueBookingRequest(booking, "approved", "");
    expect((await database.query("select status from public.venue_bookings where id = $1", [booking])).rows[0].status).toBe("approved");
  });

  // SPM-48: only Technical Support manage the equipment catalogue.
  it("lets only Technical Support create equipment", async () => {
    const code = `it-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const count = async () => (await database.query("select count(*)::int as n from public.equipment_items where code = $1", [code])).rows[0].n as number;
    await denyAll(["tech"], () => createEquipmentItem({ name: `Integration matrix ${code}`, category: "Integration", code }, 1), count);
    await signInAs("tech");
    const id = await createEquipmentItem({ name: `Integration matrix ${code}`, category: "Integration", code }, 1);
    fixture.trackEquipment(id);
    expect(await count()).toBe(1);
  });

  // SPM-77 AC3: only the Safety Officer decides a safety check.
  it("lets only the Safety Officer decide an event's safety check", async () => {
    const { id } = await planningEvent(fixture, { organiser: people.owner, lead: people.lead, coordinator: people.coordinatorA }, "Integration matrix safety event", { ...AREA_VENUE, ...DEFAULT_WINDOW });
    const booking = await submitVenueBookingRequest(id, await fixture.venue(100));
    await signInAs("staff");
    await decideVenueBookingRequest(booking, "approved", "");
    await signInAs("coordinatorA");
    await saveVenueSafetyChecks(id, SAFETY_CHECKS);
    await submitEventForSafetyCheck(id);
    await denyAll(["officer"], () => decideEventSafetyCheck(id, "approved", ""), () => eventSnapshot(id));
    await signInAs("officer");
    await decideEventSafetyCheck(id, "approved", "");
    expect((await database.query("select status from public.events where id = $1", [id])).rows[0].status).toBe("confirmed");
  });
});
