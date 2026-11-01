import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyEquipmentRequirement } from "@spm/shared";
import { cancelEvent } from "@/features/event-requests/services/event-cancellation";
import { saveEventEquipment } from "@/features/event-requests/services/coordinator-event-edit";
import { completeEvent } from "@/features/event-requests/services/event-lifecycle";
import { listEquipmentArrangements, EVENT_COMPLETED_RELEASE_REASON } from "@/features/event-requests/services/equipment-arrangements";
import { requestEventEquipment } from "@/features/event-requests/services/equipment";
import { loadEquipmentArrangementHistory } from "@/features/equipment/services/equipment-arrangement-status";
import {
  changeEquipmentReservation, listEventEquipmentAvailability, releaseEquipmentReservation, reserveEquipment,
} from "@/features/equipment/services/equipment-availability";
import { createEquipmentItem, setEquipmentUnitRetired } from "@/features/equipment/services/equipment-inventory";
import { loadEventReadiness } from "@/features/safety-check/services/event-readiness";
import { saveEquipmentPlacement } from "@/features/safety-check/services/safety-plan";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";
import {
  AREA_VENUE, confirmedEvent, createActors, DEFAULT_WINDOW, eventSnapshot, notificationRecipients, planningEvent,
} from "./support/workflow";

// Workflow 3: equipment arrangements. The coordinator records and requests
// equipment (SPM-27), Technical Support checks availability and reserves it
// (SPM-31/32), and the arrangement status and history follow the reservation
// (SPM-28). SPM-30 (unavailability) and hand-set statuses were removed from
// the product (migration 202610310009), so only retired units reduce supply
// here. Cancel/complete release behaviour is the SPM-45/46 part carried over
// from workflow 5.

let fixture: IntegrationFixture;
let actors: Awaited<ReturnType<typeof createActors>>;
let tech: Awaited<ReturnType<IntegrationFixture["user"]>>;
let techB: Awaited<ReturnType<IntegrationFixture["user"]>>;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let officer: Awaited<ReturnType<IntegrationFixture["user"]>>;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  actors = await createActors(fixture);
  tech = await fixture.user("technical_support_staff");
  techB = await fixture.user("technical_support_staff");
  staff = await fixture.user("venue_staff");
  officer = await fixture.user("safety_officer");
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

const PERIOD = { requiredFrom: "2099-07-01T09:00", requiredUntil: "2099-07-01T17:00" };
const cast = (coordinator = actors.coordinatorA) => ({ organiser: actors.organiser, lead: actors.lead, coordinator, staff, officer });

/** Technical Support creates a catalogue item with the given number of units, through the real service. */
async function stock(units: number) {
  await fixture.signIn(tech);
  const code = `it-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
  const id = await createEquipmentItem({ name: `Integration mic ${code}`, category: "Integration", code }, units);
  fixture.trackEquipment(id);
  return id as string;
}

/** A Planning event whose coordinator has recorded (but not yet requested) an equipment requirement. */
async function eventNeeding(title: string, itemId: string, quantity: number, coordinator = actors.coordinatorA, period = PERIOD) {
  const { id } = await planningEvent(fixture, cast(coordinator), title, { ...AREA_VENUE, ...DEFAULT_WINDOW });
  await saveEventEquipment(id, (equipment) => [
    ...equipment, { ...emptyEquipmentRequirement(period), equipmentItemId: itemId, quantity: String(quantity), notes: "XLR cables" },
  ]);
  const requirementId = (await database.query("select id from public.event_equipment_requirements where event_id = $1", [id])).rows[0].id as string;
  return { id, requirementId };
}

async function requested(title: string, itemId: string, quantity: number, coordinator = actors.coordinatorA) {
  const event = await eventNeeding(title, itemId, quantity, coordinator);
  await fixture.signIn(coordinator);
  expect(await requestEventEquipment(event.id, [event.requirementId])).toBe(1);
  return event;
}

async function reservedQuantity(itemId: string) {
  return (await database.query(
    "select coalesce(sum(quantity), 0)::int as n from public.equipment_reservations where equipment_item_id = $1 and status = 'approved'", [itemId])).rows[0].n as number;
}

/** What Technical Support sees for one requirement. */
async function result(eventId: string, requirementId: string) {
  const events = await listEventEquipmentAvailability();
  return events.find((event) => event.id === eventId)?.results.find((item) => item.requirementId === requirementId);
}

describe("Workflow: equipment arrangements", () => {
  // SPM-27 AC1/AC9/AC10, SPM-32 AC1-AC3, SPM-31 AC1-AC4: request, availability, reserve, refuse, race.
  it("reserves requested equipment, reduces availability, refuses an over-reservation and survives a stock race", async () => {
    const itemId = await stock(3);
    const first = await eventNeeding("Integration equipment A", itemId, 2);
    const second = await eventNeeding("Integration equipment B", itemId, 2, actors.coordinatorB);

    // SPM-27 AC10: a coordinator who is not assigned cannot change or request the equipment.
    await fixture.signIn(actors.coordinatorB);
    const before = await eventSnapshot(first.id);
    await expect(saveEventEquipment(first.id, (equipment) => equipment.slice(1))).rejects.toThrow();
    await expect(requestEventEquipment(first.id, [first.requirementId])).rejects.toThrow(/assigned coordinator/i);
    expect(await eventSnapshot(first.id)).toEqual(before);

    // SPM-32 AC1: an item that has not been requested cannot be reserved.
    await fixture.signIn(tech);
    await expect(reserveEquipment(first.requirementId, 2)).rejects.toThrow();
    expect(await reservedQuantity(itemId)).toBe(0);

    // The coordinators send their requests; Technical Support is notified.
    await fixture.signIn(actors.coordinatorA);
    await requestEventEquipment(first.id, [first.requirementId]);
    await fixture.signIn(actors.coordinatorB);
    await requestEventEquipment(second.id, [second.requirementId]);
    expect(await notificationRecipients(first.id, "equipment_requested")).toEqual([tech.id, techB.id].sort());

    // SPM-31: availability per requirement shows the stock; nothing is reserved yet.
    await fixture.signIn(tech);
    expect(await result(first.id, first.requirementId)).toMatchObject({ totalUnits: 3, reservedQuantity: 0, availableQuantity: 3, status: "available", requestedQuantity: 2 });

    // SPM-32 AC1: the reservation records event, item, quantity, period, staff member and time.
    await reserveEquipment(first.requirementId, 2);
    const reservation = (await database.query(
      "select event_id, equipment_item_id, quantity, decided_by, decided_at is not null as timed, starts_at, ends_at from public.equipment_reservations where event_id = $1", [first.id])).rows[0];
    expect(reservation).toMatchObject({ event_id: first.id, equipment_item_id: itemId, quantity: 2, decided_by: tech.id, timed: true });
    expect((await listEquipmentArrangements(first.id))[0]).toMatchObject({ status: "reserved", quantity: 2, reservedByName: expect.any(String) });

    // SPM-32 AC3/SPM-31: the reserved quantity is no longer available to the other event.
    expect(await result(second.id, second.requirementId)).toMatchObject({ availableQuantity: 1, reservedQuantity: 2 });
    expect((await result(second.id, second.requirementId))?.status).not.toBe("available");

    // SPM-32 AC2: reserving more than is available is refused, showing what is available.
    const beforeRefusal = await reservedQuantity(itemId);
    await expect(reserveEquipment(second.requirementId, 2)).rejects.toThrow(/Only 1 available/);
    expect(await reservedQuantity(itemId)).toBe(beforeRefusal);

    // SPM-32 AC2 (race): two Technical Support staff reserve the last units for different events at once.
    const raceItem = await stock(2);
    const left = await requested("Integration equipment race left", raceItem, 2);
    const right = await requested("Integration equipment race right", raceItem, 2);
    vi.resetModules();
    const secondClient = (await import("@/lib/supabase-client")).supabase;
    const secondService = await import("@/features/equipment/services/equipment-availability");
    try {
      await fixture.signIn(tech);
      const { error } = await secondClient.auth.signInWithPassword(techB);
      if (error) throw new Error("Could not sign in the second Technical Support user.");
      const results = await Promise.allSettled([
        reserveEquipment(left.requirementId, 2),
        secondService.reserveEquipment(right.requirementId, 2),
      ]);
      expect(results.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(await reservedQuantity(raceItem)).toBe(2);
    } finally {
      await secondClient.auth.signOut();
      secondClient.auth.stopAutoRefresh();
    }
  });

  // SPM-31 AC1/AC4: retired units are not stock.
  it("does not count retired units as available and refuses a reservation above what is left", async () => {
    const itemId = await stock(3);
    const event = await requested("Integration retired units", itemId, 3);

    await fixture.signIn(tech);
    expect(await result(event.id, event.requirementId)).toMatchObject({ totalUnits: 3, availableQuantity: 3 });
    const unit = (await database.query("select id from public.equipment_units where equipment_item_id = $1 order by unit_number limit 1", [itemId])).rows[0].id as string;
    await setEquipmentUnitRetired(unit, true);
    expect(await result(event.id, event.requirementId)).toMatchObject({ totalUnits: 2, availableQuantity: 2 });
    await expect(reserveEquipment(event.requirementId, 3)).rejects.toThrow(/Only 2 available/);
    expect(await reservedQuantity(itemId)).toBe(0);
    await reserveEquipment(event.requirementId, 2);
    expect(await reservedQuantity(itemId)).toBe(2);
  });

  // SPM-28 AC1/AC2/AC4/AC6/AC7, SPM-32 AC4/AC5: status follows the reservation; history; re-check; release.
  it("derives the arrangement status from the reservation, records every step, flags a changed requirement and returns released stock", async () => {
    const itemId = await stock(4);
    const event = await requested("Integration arrangement status", itemId, 2);
    const status = async () => (await result(event.id, event.requirementId))?.arrangement?.status;

    await fixture.signIn(tech);
    expect(await status()).toBe("not_started");
    // Part of the quantity reserved: In progress. The full quantity: Arranged.
    await reserveEquipment(event.requirementId, 1);
    expect(await status()).toBe("in_progress");
    const reservationId = (await database.query("select id from public.equipment_reservations where event_id = $1", [event.id])).rows[0].id as string;
    await changeEquipmentReservation(reservationId, 2);
    expect(await status()).toBe("arranged");

    // SPM-28 AC4: each step is recorded with actor, time and status, in order.
    const history = (await loadEquipmentArrangementHistory([event.id])).get(event.requirementId) ?? [];
    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.every((entry) => entry.updatedByName && entry.updatedAt)).toBe(true);
    expect(history.map((entry) => entry.id)).toEqual([...history.map((entry) => entry.id)].sort((a, b) => a - b));
    expect(history.at(-1)?.status).toBe("arranged");

    // SPM-28 AC4/AC5: the coordinator reads status and history but cannot change the reservation;
    // nobody can set a status by hand.
    await fixture.signIn(actors.coordinatorA);
    expect((await loadEquipmentArrangementHistory([event.id])).get(event.requirementId)).toEqual(history);
    const snapshot = await eventSnapshot(event.id);
    await expect(reserveEquipment(event.requirementId, 1)).rejects.toThrow();
    await expect(changeEquipmentReservation(reservationId, 1)).rejects.toThrow();
    await expect(releaseEquipmentReservation(reservationId, "Not allowed")).rejects.toThrow();
    expect(await reservedQuantity(itemId)).toBe(2);
    expect(await eventSnapshot(event.id)).toEqual(snapshot);
    expect((await database.query("select count(*)::int as n from pg_proc where proname = 'update_equipment_arrangement'")).rows[0].n).toBe(0);

    // SPM-32 AC4: changing the requirement after it was reserved marks the reservation for re-checking.
    await saveEventEquipment(event.id, (equipment) => equipment.map((row) => ({ ...row, requiredUntil: "2099-07-01T18:00" })));
    await fixture.signIn(tech);
    expect((await result(event.id, event.requirementId))?.reservation).toMatchObject({ needsRecheck: true });
    expect(await status()).toBe("issue");
    await fixture.signIn(actors.coordinatorA);
    expect((await loadEventReadiness(event.id)).outstandingItems.map((item) => item.code)).toContain("equipment_needs_review");

    // SPM-32 AC5: releasing returns the quantity to the pool and is recorded; reserving again completes the arrangement.
    await fixture.signIn(tech);
    await expect(releaseEquipmentReservation(reservationId, "Period changed, reserve again")).resolves.toBeUndefined();
    expect(await reservedQuantity(itemId)).toBe(0);
    expect((await result(event.id, event.requirementId))?.availableQuantity).toBe(4);
    expect((await loadEquipmentArrangementHistory([event.id])).get(event.requirementId)?.length).toBeGreaterThan(history.length);
    await reserveEquipment(event.requirementId, 2);
    expect(await status()).toBe("arranged");
  });

  // SPM-45 (equipment part) and SPM-46 AC6, carried over from workflow 5.
  it("releases reservations when an event is cancelled or completed, and labels them by reason", async () => {
    const itemId = await stock(4);

    // Cancel: the reservation is released and Technical Support is told.
    const cancelled = await requested("Integration cancelled equipment event", itemId, 2);
    await fixture.signIn(tech);
    await reserveEquipment(cancelled.requirementId, 2);
    await fixture.signIn(actors.coordinatorA);
    await cancelEvent(cancelled.id, "Sponsor withdrew");
    const [released] = await listEquipmentArrangements(cancelled.id);
    expect(released).toMatchObject({ status: "released", quantity: 2 });
    expect(released.releaseReason).not.toBe(EVENT_COMPLETED_RELEASE_REASON);
    expect(released.history.map((entry) => entry.action)).toContain("released");
    expect(await notificationRecipients(cancelled.id, "cancellation")).toEqual(expect.arrayContaining([tech.id, techB.id]));
    expect(await reservedQuantity(itemId)).toBe(0);

    // Complete: a Confirmed event with fully reserved equipment, then completed.
    const completed = await confirmedEvent(fixture, cast(), "Integration completed equipment event", {
      pastSchedule: true,
      beforeSafetyCheck: async (eventId) => {
        await saveEventEquipment(eventId, (equipment) => [
          ...equipment, { ...emptyEquipmentRequirement({ requiredFrom: "2020-07-01T09:00", requiredUntil: "2020-07-01T17:00" }), equipmentItemId: itemId, quantity: "2" },
        ]);
        const requirementId = (await database.query("select id from public.event_equipment_requirements where event_id = $1", [eventId])).rows[0].id as string;
        await requestEventEquipment(eventId, [requirementId]);
        await fixture.signIn(tech);
        await reserveEquipment(requirementId, 2);
        await fixture.signIn(actors.coordinatorA);
        await saveEquipmentPlacement(eventId, { equipmentPlacement: "Front of stage" });
      },
    });
    await fixture.signIn(actors.coordinatorA);
    await completeEvent(completed.id);
    const [done] = await listEquipmentArrangements(completed.id);
    expect(done).toMatchObject({ status: "released", releaseReason: EVENT_COMPLETED_RELEASE_REASON, quantity: 2 });
    expect(done.history.map((entry) => entry.action)).toEqual(expect.arrayContaining(["released"]));
    expect(await reservedQuantity(itemId)).toBe(0);
  });
});
