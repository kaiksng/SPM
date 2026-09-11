import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@spm/shared";

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing ${name}. Set it in the backend's .env file.`);
  }
  return value;
}

let client: SupabaseClient<Database> | undefined;

/**
 * Uses the service_role key, which bypasses Row Level Security. Only ever
 * import this in backend code that has already authorized the caller (see
 * middleware/auth.ts) — it must never be exposed to the frontend.
 */
export function getServiceClient() {
  if (!client) {
    client = createClient<Database>(
      requiredEnv("SUPABASE_URL", process.env.SUPABASE_URL),
      requiredEnv(
        "SUPABASE_SERVICE_ROLE_KEY",
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      { auth: { persistSession: false } },
    );
  }
  return client;
}
