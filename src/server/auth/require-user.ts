import "server-only";

import { createClient } from "@/lib/supabase/server";
import { ApplicationError } from "@/server/errors/application-error";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new ApplicationError(
      "UNAUTHENTICATED",
      "You must sign in to continue",
      error,
    );
  }

  return user;
}
