import { supabase } from "@/lib/supabase-client";

export async function logout() {
  await supabase.auth.signOut();
}
