import { createClient } from "@supabase/supabase-js";
import type { Database } from "@spm/shared";

function requiredEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(`Missing ${name}. Copy .env.example to .env and configure Supabase.`);
  }
  return value;
}

export const supabase = createClient<Database>(
  requiredEnv("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  requiredEnv(
    "VITE_SUPABASE_PUBLISHABLE_KEY",
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ),
);
