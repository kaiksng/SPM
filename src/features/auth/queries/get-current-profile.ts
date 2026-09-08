import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getCurrentProfile(userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", userId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
