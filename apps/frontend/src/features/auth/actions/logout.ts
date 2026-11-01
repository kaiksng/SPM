import { supabase } from "@/lib/supabase-client";

/**
 * Signs out this browser only. The default ("global") ends every session of
 * the account, so with the team's shared test accounts one person signing
 * out would cancel everyone else's session: their pages kept loading, but
 * every backend action failed with "You must sign in to continue".
 */
export async function logout() {
  await supabase.auth.signOut({ scope: "local" });
}
