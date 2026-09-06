import "server-only";

import { createClient } from "@/lib/supabase/server";

export async function getEvent(eventId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();

  if (error) {
    throw error;
  }

  return data;
}
