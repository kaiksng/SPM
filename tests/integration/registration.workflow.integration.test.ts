import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistrationSettingsFormValues } from "@spm/shared";
import { cancelEvent } from "@/features/event-requests/services/event-cancellation";
import { listNotifications } from "@/features/notifications/services/notifications";
import {
  getOwnRegistrationStatus, getRegisteredCount, getWaitlistPosition, joinWaitlist, leaveWaitlist, listEventRegistrations,
  listMyRegistrations, registerForEvent, withdrawRegistration,
} from "@/features/registrations/services/registrations";
import { saveRegistrationSettings } from "@/features/registrations/services/registration-settings";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";
import { AREA_VENUE, confirmedEvent, createActors, DEFAULT_WINDOW, notificationRecipients, planningEvent } from "./support/workflow";

// Workflow 6: registration. The organiser sets the rules (SPM-40), attendees
// register, race for places and use the waiting list (SPM-41/42), withdraw
// (SPM-43), the roster is read by the people who manage the event (SPM-44),
// and cancelling notifies registered attendees (SPM-45). Attendee access to
// internal planning data (SPM-49) is covered by the role-access matrix.
//
// Clock note: registration must be open now, so the window is built from the
// real current time (opened a day ago, closes in 30 days); the events stay in 2099.

let fixture: IntegrationFixture;
let actors: Awaited<ReturnType<typeof createActors>>;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;
let officer: Awaited<ReturnType<IntegrationFixture["user"]>>;
let attendees: Array<Awaited<ReturnType<IntegrationFixture["user"]>>>;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  actors = await createActors(fixture);
  staff = await fixture.user("venue_staff");
  officer = await fixture.user("safety_officer");
  attendees = [await fixture.user("attendee"), await fixture.user("attendee"), await fixture.user("attendee"), await fixture.user("attendee")];
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

const cast = () => ({ organiser: actors.organiser, lead: actors.lead, coordinator: actors.coordinatorA, staff, officer });
/** Singapore local "YYYY-MM-DDTHH:mm" for now plus an offset. */
const sgLocal = (offsetMs: number) => new Date(Date.now() + 8 * 3_600_000 + offsetMs).toISOString().slice(0, 16);
const DAY = 24 * 3_600_000;

function settings(capacity: number, waitlistEnabled = true, withdrawalPermitted = true): RegistrationSettingsFormValues {
  return { required: true, opensAt: sgLocal(-DAY), closesAt: sgLocal(30 * DAY), capacity: String(capacity), waitlistEnabled, withdrawalPermitted };
}

/** A Confirmed event, reached through the real flow, with registration open. The organiser sets the rules in Planning. */
async function openEvent(title: string, capacity: number, waitlistEnabled = true) {
  return confirmedEvent(fixture, cast(), title, {
    beforeSafetyCheck: async (eventId) => {
      await fixture.signIn(actors.organiser);
      await saveRegistrationSettings(eventId, settings(capacity, waitlistEnabled));
    },
  });
}

async function rows(eventId: string) {
  return (await database.query(
    "select attendee_id, status from public.event_registrations where event_id = $1 order by registered_at, id", [eventId])).rows as Array<{ attendee_id: string; status: string }>;
}
async function count(eventId: string, status: string) {
  return (await rows(eventId)).filter((row) => row.status === status).length;
}

describe("Workflow: registration", () => {
  // SPM-40 AC3-AC5/AC7/AC9, SPM-41 AC2-AC5, SPM-44 AC1-AC4: rules, registering and the roster.
  it("enforces the registration rules and shows the roster only to the people who manage the event", async () => {
    const [attendeeA, attendeeB] = attendees;

    // SPM-40 AC4/AC5: an invalid window is refused and nothing is saved; only the owner can configure.
    const early = await planningEvent(fixture, cast(), "Integration registration rules", { ...AREA_VENUE, ...DEFAULT_WINDOW });
    await fixture.signIn(actors.organiser);
    await expect(saveRegistrationSettings(early.id, { ...settings(2), opensAt: sgLocal(30 * DAY), closesAt: sgLocal(DAY) })).rejects.toThrow(/closing time must be after/i);
    expect((await database.query("select registration_required from public.event_registration_requirements where event_id = $1", [early.id])).rows[0]?.registration_required ?? false).toBe(false);
    const stranger = await fixture.organiser();
    await fixture.signIn(stranger);
    await expect(saveRegistrationSettings(early.id, settings(2))).rejects.toThrow(/Only the event's organiser/);
    await fixture.signIn(actors.organiser);
    await saveRegistrationSettings(early.id, settings(2));

    // SPM-40 AC9: attendees cannot register before the event is Confirmed, even though the window is open.
    await fixture.signIn(attendeeA);
    await expect(registerForEvent(early.id)).rejects.toThrow(/not open for registration/i);
    expect(await rows(early.id)).toEqual([]);

    // A Confirmed event with registration open; SPM-40 AC7: its settings are now locked.
    const event = await openEvent("Integration registration event", 2);
    await fixture.signIn(actors.organiser);
    await expect(saveRegistrationSettings(event.id, settings(5))).rejects.toThrow(/only be changed while the event is in Planning/i);
    expect((await database.query("select attendee_capacity from public.event_registration_requirements where event_id = $1", [event.id])).rows[0].attendee_capacity).toBe(2);

    // SPM-41 AC2: registering inside the window with places left.
    await fixture.signIn(attendeeA);
    await registerForEvent(event.id);
    expect(await getOwnRegistrationStatus(event.id, attendeeA.id)).toBe("registered");
    expect(await getRegisteredCount(event.id)).toBe(1);
    expect((await listMyRegistrations(attendeeA.id)).find((entry) => entry.eventId === event.id)).toMatchObject({ status: "registered" });
    // SPM-41 AC5: a duplicate creates nothing.
    await expect(registerForEvent(event.id)).rejects.toThrow(/already registered/i);
    expect(await getRegisteredCount(event.id)).toBe(1);
    expect(await rows(event.id)).toHaveLength(1);

    // SPM-41 AC3: before the window opens and after it closes, registering is refused and the count is unchanged.
    // Setup only: the stored window is moved, since a real wait is impossible.
    await fixture.signIn(attendeeB);
    await database.query("update public.event_registration_requirements set registration_opens_at = now() + interval '1 day' where event_id = $1", [event.id]);
    await expect(registerForEvent(event.id)).rejects.toThrow(/has not opened/i);
    await database.query("update public.event_registration_requirements set registration_opens_at = now() - interval '2 days', registration_closes_at = now() - interval '1 hour' where event_id = $1", [event.id]);
    await expect(registerForEvent(event.id)).rejects.toThrow(/closed/i);
    await database.query("update public.event_registration_requirements set registration_opens_at = now() - interval '1 day', registration_closes_at = now() + interval '30 days' where event_id = $1", [event.id]);
    expect(await rows(event.id)).toHaveLength(1);

    // SPM-44: the organiser, the assigned coordinator and the Lead see the roster; nobody else does.
    for (const manager of [actors.organiser, actors.coordinatorA, actors.lead]) {
      await fixture.signIn(manager);
      const roster = await listEventRegistrations(event.id);
      expect(roster).toEqual([expect.objectContaining({ attendeeId: attendeeA.id, status: "registered", waitlistPosition: null })]);
      expect(roster[0].attendeeName).toBeTruthy();
      expect(roster[0].registeredAt).toEqual(expect.any(String));
    }
    for (const outsider of [stranger, actors.coordinatorB, attendeeB]) {
      await fixture.signIn(outsider);
      expect(await listEventRegistrations(event.id)).toEqual([]);
    }
  });

  // SPM-41 AC4, SPM-42 AC1/AC2/AC3: the last place and the waiting list.
  it("gives the last place to exactly one of two simultaneous attendees and queues the other", async () => {
    const [first, second] = attendees;
    const event = await openEvent("Integration last place event", 1);

    // SPM-42 AC1: the waiting list is only for a full event.
    await fixture.signIn(first);
    await expect(joinWaitlist(event.id)).rejects.toThrow(/has not reached capacity/i);
    expect(await rows(event.id)).toEqual([]);

    // SPM-41 AC4: two attendees register for the one remaining place at once.
    vi.resetModules();
    const secondClient = (await import("@/lib/supabase-client")).supabase;
    const secondService = await import("@/features/registrations/services/registrations");
    try {
      await fixture.signIn(first);
      const { error } = await secondClient.auth.signInWithPassword(second);
      if (error) throw new Error("Could not sign in the second attendee.");
      const results = await Promise.allSettled([
        registerForEvent(event.id),
        secondService.registerForEvent(event.id),
      ]);
      expect(results.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      const failure = results.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      expect(String(failure?.reason)).toMatch(/reached capacity/i);
      expect(await count(event.id, "registered")).toBe(1);
      const winner = (await rows(event.id))[0].attendee_id;
      const loser = winner === first.id ? second : first;

      // SPM-42 AC2/AC3: the loser joins at the end and sees a position; the winner cannot join.
      await fixture.signIn(winner === first.id ? first : second);
      await expect(joinWaitlist(event.id)).rejects.toThrow(/already registered/i);
      await fixture.signIn(loser);
      await joinWaitlist(event.id);
      expect(await getOwnRegistrationStatus(event.id, loser.id)).toBe("waitlisted");
      expect(await getWaitlistPosition(event.id)).toBe(1);
      await expect(joinWaitlist(event.id)).rejects.toThrow();
      expect(await count(event.id, "waitlisted")).toBe(1);
      expect(await count(event.id, "registered")).toBe(1);
    } finally {
      await secondClient.auth.signOut();
      secondClient.auth.stopAutoRefresh();
    }
  });

  // SPM-42 AC4/AC5, SPM-43 AC1-AC3, SPM-45 (attendees): withdraw, promote, leave, re-register, cancel.
  it("promotes the first waiting attendee on withdrawal, closes the gap on leaving, and notifies only registered attendees on cancel", async () => {
    const [a, b, c, d] = attendees;
    const event = await openEvent("Integration waiting list event", 1);

    await fixture.signIn(a);
    await registerForEvent(event.id);
    for (const waiting of [b, c, d]) {
      await fixture.signIn(waiting);
      await joinWaitlist(event.id);
    }
    const position = async (who: typeof a) => { await fixture.signIn(who); return getWaitlistPosition(event.id); };
    expect([await position(b), await position(c), await position(d)]).toEqual([1, 2, 3]);

    // SPM-43 AC1/AC2 and SPM-42 AC4: the withdrawal releases the place; the first in line is registered automatically.
    await fixture.signIn(a);
    await withdrawRegistration(event.id, "Cannot attend any more");
    expect((await database.query("select status, withdrawn_at is not null as timed from public.event_registrations where event_id = $1 and attendee_id = $2", [event.id, a.id])).rows)
      .toEqual([{ status: "withdrawn", timed: true }]);
    expect(await getOwnRegistrationStatus(event.id, a.id)).toBeNull();
    expect(await getRegisteredCount(event.id)).toBe(1);
    await fixture.signIn(b);
    expect(await getOwnRegistrationStatus(event.id, b.id)).toBe("registered");
    expect((await listNotifications()).filter((n) => n.eventId === event.id && n.type === "waitlist_promoted")).toHaveLength(1);
    // Everyone still waiting moves up one place.
    expect([await position(c), await position(d)]).toEqual([1, 2]);

    // SPM-42 AC5: leaving the list closes the gap behind.
    await fixture.signIn(c);
    await leaveWaitlist(event.id);
    expect(await getOwnRegistrationStatus(event.id, c.id)).toBeNull();
    expect(await position(d)).toBe(1);

    // SPM-43 AC3: someone who withdrew is evaluated afresh. The event is full, so they join the list at the end.
    await fixture.signIn(a);
    await expect(registerForEvent(event.id)).rejects.toThrow(/reached capacity/i);
    await joinWaitlist(event.id);
    expect(await getWaitlistPosition(event.id)).toBe(2);

    // SPM-45: cancelling notifies the registered attendee only, not those waiting, withdrawn or gone.
    await fixture.signIn(actors.coordinatorA);
    await cancelEvent(event.id, "Sponsor withdrew");
    const notified = await notificationRecipients(event.id, "cancellation");
    expect(notified).toContain(b.id);
    for (const other of [a, c, d]) expect(notified).not.toContain(other.id);
  });
});
