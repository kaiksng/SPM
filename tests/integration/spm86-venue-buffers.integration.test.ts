import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyVenueFormValues, toVenuePayload, type VenueFormValues } from "@spm/shared";
import { createVenue, getVenue, listVenueBufferTimeChanges, listVenues, updateVenue } from "@/features/venues/services/venues";
import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

let fixture: IntegrationFixture;
let stopBackend: (() => Promise<void>) | undefined;
let name: string;
let staff: Awaited<ReturnType<IntegrationFixture["user"]>>;

function values(): VenueFormValues {
  return { ...structuredClone(emptyVenueFormValues), name, location: "Block A", areaTags: ["Central Area"], capacity: "120", operatingHours: [{ days: ["mon", "tue"], opensAt: "09:00", closesAt: "18:00" }], layouts: ["Theatre"] };
}

beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  name = `Integration venue ${randomUUID()}`;
  staff = await fixture.user("venue_staff");
  await fixture.signIn(staff);
});
afterEach(async () => {
  try { await database.query("delete from public.venues where name = $1", [name]); }
  finally { await fixture.cleanup(); }
});
afterAll(async () => {
  try {
    await stopBackend?.();
    expect((await database.query("select count(*)::int as n from public.venues where name like 'Integration venue %'")).rows[0].n).toBe(0);
    await assertNoFixtureResidue();
  } finally { await database.end(); }
});

describe("SPM-86 venue setup and turnaround", () => {
  // SPM-86 AC1, AC3 and AC4: real create, update, read and audit paths.
  it("saves defaults and changes, and exposes values and history", async () => {
    const id = (await createVenue(values())).venueId;
    expect(await getVenue(id)).toMatchObject({ setupTimeMinutes: "0", turnaroundTimeMinutes: "0" });
    await updateVenue(id, { ...values(), setupTimeMinutes: "30", turnaroundTimeMinutes: "15" });
    expect(await getVenue(id)).toMatchObject({ setupTimeMinutes: "30", turnaroundTimeMinutes: "15" });
    expect(await listVenues()).toEqual(expect.arrayContaining([expect.objectContaining({ id, setupTimeMinutes: 30, turnaroundTimeMinutes: 15 })]));
    const audit = (await database.query("select field_name, previous_value, new_value, changed_by, changed_at from public.venue_buffer_time_changes where venue_id = $1 order by field_name", [id])).rows;
    expect(audit).toEqual([
      expect.objectContaining({ field_name: "setup_time_minutes", previous_value: 0, new_value: 30, changed_by: staff.id, changed_at: expect.any(Date) }),
      expect.objectContaining({ field_name: "turnaround_time_minutes", previous_value: 0, new_value: 15, changed_by: staff.id, changed_at: expect.any(Date) }),
    ]);
    expect(await listVenueBufferTimeChanges(id)).toHaveLength(2);
    await updateVenue(id, { ...values(), setupTimeMinutes: "45", turnaroundTimeMinutes: "15" });
    expect(await listVenueBufferTimeChanges(id)).toEqual(expect.arrayContaining([expect.objectContaining({ field: "setup_time_minutes", previousValue: 30, newValue: 45, changedByName: "Synthetic integration user" })]));
  });

  // SPM-86 AC2: both fields identify invalid input and preserve stored values.
  it.each([["setupTimeMinutes", "-1"], ["turnaroundTimeMinutes", "abc"]] as const)("rejects invalid %s", async (field, invalid) => {
    const id = (await createVenue(values())).venueId;
    await expect(updateVenue(id, { ...values(), [field]: invalid })).rejects.toMatchObject({ issues: expect.arrayContaining([expect.objectContaining({ path: [field] })]) });
    expect(await getVenue(id)).toMatchObject({ setupTimeMinutes: "0", turnaroundTimeMinutes: "0" });
    expect(await listVenueBufferTimeChanges(id)).toEqual([]);
  });

  // SPM-86 AC5: denial occurs through the real authenticated backend.
  it("denies a non-staff user without changing values or history", async () => {
    const id = (await createVenue(values())).venueId;
    await updateVenue(id, { ...values(), setupTimeMinutes: "30" });
    for (const role of ["event_organiser", "event_coordinator", "technical_support_staff", "attendee", "event_coordinator_lead", "safety_officer"] as const) {
      const other = await fixture.user(role);
      await fixture.signIn(other);
      await expect(apiFetch(`/venues/${id}/update`, { method: "POST", body: JSON.stringify({ venue: toVenuePayload({ ...values(), setupTimeMinutes: "90" }) }) })).rejects.toMatchObject({ status: 403 });
    }
    const row = (await database.query("select setup_time_minutes, turnaround_time_minutes from public.venues where id = $1", [id])).rows[0];
    expect(row).toEqual({ setup_time_minutes: 30, turnaround_time_minutes: 0 });
    expect((await database.query("select count(*)::int as n from public.venue_buffer_time_changes where venue_id = $1", [id])).rows[0].n).toBe(1);
    await supabase.auth.signOut();
    await expect(apiFetch(`/venues/${id}/update`, { method: "POST", body: JSON.stringify({ venue: toVenuePayload({ ...values(), setupTimeMinutes: "90" }) }) })).rejects.toMatchObject({ status: 401 });
    expect((await database.query("select setup_time_minutes, turnaround_time_minutes from public.venues where id = $1", [id])).rows[0]).toEqual(row);
    expect((await database.query("select count(*)::int as n from public.venue_buffer_time_changes where venue_id = $1", [id])).rows[0].n).toBe(1);
  });
});
