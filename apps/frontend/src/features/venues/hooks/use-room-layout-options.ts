import { ROOM_LAYOUT_TYPES } from "@spm/shared";
import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase-client";

/** Standard layouts plus any custom layouts saved in the venue catalogue. */
export function useRoomLayoutOptions() {
  const [options, setOptions] = useState<string[]>([...ROOM_LAYOUT_TYPES]);

  useEffect(() => {
    let active = true;
    supabase.from("venue_layouts").select("layout_name").then(({ data, error }) => {
      if (!active || error || !data) return;
      setOptions([...new Set([...ROOM_LAYOUT_TYPES, ...data.map((row) => row.layout_name)])]);
    });
    return () => { active = false; };
  }, []);

  return options;
}
