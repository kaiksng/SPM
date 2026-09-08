import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

export const getCurrentProfile = cache(async function getCurrentProfile(
  userId: string,
) {
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
});
