import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "./database.types";

function requiredBrowserEnv(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy .env.example to .env.local and add the Supabase value.`,
    );
  }
  return value;
}

export function createClient() {
  return createBrowserClient<Database>(
    requiredBrowserEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requiredBrowserEnv(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  );
}
