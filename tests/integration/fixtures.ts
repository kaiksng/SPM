import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@spm/shared";
import pg from "pg";
import { assertDedicatedTarget } from "../../scripts/integration-environment.mjs";
import { supabase } from "@/lib/supabase-client";

assertDedicatedTarget(process.env.VITE_SUPABASE_URL, process.env.INTEGRATION_DATABASE_URL, process.env.INTEGRATION_PROJECT_ID);
if (!process.env.INTEGRATION_SERVICE_ROLE_KEY) throw new Error("Run through pnpm test:integration.");

// Administrative access is exclusively for fixture setup and independent
// persisted-state assertions. All tested actions use the application's client.
export const database = new pg.Pool({ connectionString: process.env.INTEGRATION_DATABASE_URL, max: 1 });
const admin = createClient<Database>(process.env.VITE_SUPABASE_URL!, process.env.INTEGRATION_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

export class DraftFixture {
  private users: Array<{ id: string; email: string; password: string }> = [];
  private equipmentIds: string[] = [];

  async organiser() {
    const email = `integration-${randomUUID()}@example.test`;
    const password = `Test-${randomUUID()}!`;
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: "Synthetic integration organiser", role: "event_organiser" },
    });
    if (error || !data.user) throw new Error("Could not create a dedicated test organiser.");
    const user = { id: data.user.id, email, password };
    this.users.push(user);
    const result = await database.query("select role from public.profiles where id = $1", [user.id]);
    if (result.rows[0]?.role !== "event_organiser") throw new Error("Fixture organiser role was not created.");
    return user;
  }

  async signIn(user: { email: string; password: string }) {
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword(user);
    if (error) throw new Error("Could not sign in to the dedicated test stack.");
  }

  async equipment() {
    const id = randomUUID();
    this.equipmentIds.push(id);
    await database.query(
      "insert into public.equipment_items (id, name, category, code, total_quantity) values ($1, $2, 'Integration', $3, 0)",
      [id, `Integration projector ${id}`, `it-${id.replaceAll("-", "").slice(0, 16)}`],
    );
    return id;
  }

  async cleanup() {
    try {
      await supabase.auth.signOut();
    } finally {
      supabase.auth.stopAutoRefresh();
      const ids = this.users.map((user) => user.id);
      // Events first: dependent requirements/history/notifications cascade.
      await database.query("delete from public.events where organiser_id = any($1::uuid[])", [ids]);
      await database.query("delete from public.audit_logs where actor_id = any($1::uuid[])", [ids]);
      await database.query("delete from public.equipment_items where id = any($1::uuid[])", [this.equipmentIds]);
      for (const user of this.users) {
        const { error } = await admin.auth.admin.deleteUser(user.id);
        if (error) throw new Error("Could not remove a dedicated fixture account.");
      }
      const result = await database.query(
        "select count(*)::int as remaining from auth.users where id = any($1::uuid[])", [ids],
      );
      if (result.rows[0].remaining !== 0) throw new Error("Fixture account cleanup left records behind.");
    }
  }
}

export async function assertNoFixtureResidue() {
  const { rows } = await database.query(`
    select
      (select count(*)::int from auth.users where email like 'integration-%@example.test') as users,
      (select count(*)::int from public.equipment_items where category = 'Integration') as equipment,
      (select count(*)::int from public.events where title like 'Integration %') as events
  `);
  if (Object.values(rows[0]).some((count) => count !== 0)) throw new Error("Integration fixture residue detected.");
  console.log("Dedicated fixture cleanup verified: zero accounts, events or equipment left behind.");
}
