import "server-only";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Page/layout-safe auth guard: redirects to sign-in instead of throwing.
 * Use this in Server Components (e.g. a protected layout). For Server
 * Actions and route handlers, prefer `requireUser`, which throws an
 * `ApplicationError` instead, since a hard redirect is not appropriate there.
 */
export async function requireUserForPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
