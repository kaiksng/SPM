import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { emptyEventRequestFormValues, type UserRole } from "@spm/shared";
import { login } from "@/features/auth/actions/login";
import { loadEventDraft, saveEventDraft } from "@/features/event-requests/services/event-drafts";
import { apiFetch } from "@/lib/api-client";
import { supabase } from "@/lib/supabase-client";
import { startIntegrationBackend } from "./backend";
import { assertNoFixtureResidue, database, IntegrationFixture } from "./fixtures";

// Explicit expected destinations, rather than deriving the oracle with the
// same helper used by login(). Screen navigation remains a UI assertion.
const roleDestinations = [
  ["event_organiser", "/events"],
  ["event_coordinator", "/events"],
  ["venue_staff", "/venue-requests"],
  ["technical_support_staff", "/equipment"],
  ["attendee", "/browse-events"],
  ["event_coordinator_lead", "/events"],
  ["safety_officer", "/safety-checks"],
] as const satisfies readonly (readonly [UserRole, string])[];

function credentialsForm(email: string, password: string) {
  const form = new FormData();
  form.set("email", email);
  form.set("password", password);
  return form;
}

let fixture: IntegrationFixture;
let stopBackend: (() => Promise<void>) | undefined;
beforeAll(async () => { stopBackend = await startIntegrationBackend(); });
beforeEach(async () => {
  fixture = new IntegrationFixture();
  await supabase.auth.signOut();
});
afterEach(async () => { await fixture.cleanup(); });
afterAll(async () => {
  try {
    await stopBackend?.();
    await assertNoFixtureResidue();
  } finally {
    await database.end();
  }
});

describe("SPM-13: real login / Auth / profiles / protected application calls", () => {
  // SPM-13 AC1: real credentials, session identity and stored profile select the destination.
  it.each(roleDestinations)("signs in %s and returns %s", async (role, redirectTo) => {
    const user = await fixture.user(role);
    const state = await login(undefined, credentialsForm(user.email, user.password));
    expect(state).toEqual({ redirectTo });

    const session = await supabase.auth.getSession();
    expect(session.error).toBeNull();
    // Assert identity without printing the access/refresh tokens on failure.
    expect(session.data.session?.user.id).toBe(user.id);
    expect(Boolean(session.data.session?.access_token)).toBe(true);
    const verified = await supabase.auth.getUser();
    expect(verified.error).toBeNull();
    expect(verified.data.user?.id).toBe(user.id);
    const profile = await supabase.from("profiles").select("id, role").eq("id", user.id).single();
    expect(profile.error).toBeNull();
    expect(profile.data).toEqual({ id: user.id, role });
  });

  // SPM-13 AC2: both incorrect credential cases have the same independent oracle.
  it.each(["wrong password", "unknown email"] as const)("rejects %s with a generic message and no session", async (scenario) => {
    const user = await fixture.organiser();
    const email = scenario === "unknown email" ? `integration-${randomUUID()}@example.test` : user.email;
    const password = scenario === "wrong password" ? `Wrong-${randomUUID()}!` : user.password;
    if (scenario === "unknown email") {
      expect((await database.query("select id from auth.users where email = $1", [email])).rows).toEqual([]);
    }
    const state = await login(undefined, credentialsForm(email, password));
    expect(state).toEqual({ message: "Invalid email or password." });
    const { data, error } = await supabase.auth.getSession();
    expect(error).toBeNull();
    expect(data.session === null).toBe(true);
  });

  // SPM-13 AC1/AC3: a valid token reaches real validation; signing out then
  // denies both protected reads and the very same backend action.
  it("blocks protected data and actions after sign-out, preserving the stored draft", async () => {
    const user = await fixture.organiser();
    expect(await login(undefined, credentialsForm(user.email, user.password))).toEqual({ redirectTo: "/events" });
    const id = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title: "Integration sign-in control" });
    expect((await loadEventDraft(id)).values.title).toBe("Integration sign-in control");

    // An intentionally incomplete draft must reach submission validation.
    // This control prevents an always-401/broken server from passing the test.
    await expect(apiFetch(`/events/${id}/submit`, { method: "POST" })).rejects.toMatchObject({
      status: 422,
      fields: expect.arrayContaining([expect.objectContaining({ field: "purpose" })]),
    });
    await supabase.auth.signOut();
    expect((await supabase.auth.getSession()).data.session === null).toBe(true);
    await expect(loadEventDraft(id)).rejects.toThrow("unavailable");
    await expect(apiFetch(`/events/${id}/submit`, { method: "POST" })).rejects.toMatchObject({
      status: 401, message: "You must sign in to continue",
    });
    const { rows } = await database.query("select title, status, submitted_at, assigned_coordinator_id from public.events where id = $1", [id]);
    expect(rows).toEqual([{
      title: "Integration sign-in control", status: "draft", submitted_at: null, assigned_coordinator_id: null,
    }]);
  });

  // SPM-13 AC3: exercise real backend token verification against local Auth,
  // not only the middleware's missing-header shortcut.
  it("rejects an invalid bearer token without changing the protected event", async () => {
    const user = await fixture.organiser();
    await login(undefined, credentialsForm(user.email, user.password));
    const id = await saveEventDraft({ ...structuredClone(emptyEventRequestFormValues), title: "Integration invalid-token control" });
    await supabase.auth.signOut();
    const response = await fetch(`http://127.0.0.1:55398/events/${id}/submit`, {
      method: "POST", headers: { Authorization: "Bearer invalid-integration-token" },
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "You must sign in to continue" });
    expect((await database.query("select status, submitted_at from public.events where id = $1", [id])).rows)
      .toEqual([{ status: "draft", submitted_at: null }]);
  });
});
