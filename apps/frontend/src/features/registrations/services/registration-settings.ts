import { singaporeLocalToIso, type RegistrationSettingsFormValues } from "@spm/shared";

import { supabase } from "@/lib/supabase-client";

export type SavedRegistrationSettings = {
  required: boolean;
  opensAt: string | null;
  closesAt: string | null;
  capacity: number | null;
  waitlistEnabled: boolean;
  withdrawalPermitted: boolean;
};

/**
 * Configure Event Registration AC08: the approved main venue's capacity, or
 * null when there is none yet. The same function caps the save and
 * event_readiness, so the panel and the safety check never disagree.
 */
export async function loadMainVenueCapacity(eventId: string): Promise<number | null> {
  const { data, error } = await supabase.rpc("event_main_venue_capacity", { p_event_id: eventId });

  if (error) throw new Error("The main venue's capacity could not be loaded.");

  return data ?? null;
}

/**
 * configure_event_registration sends no notifications, so this calls the
 * RPC directly rather than through apps/backend (same as
 * resolveArrangementFlag). The database re-checks every rule.
 */
export async function saveRegistrationSettings(
  eventId: string,
  values: RegistrationSettingsFormValues,
): Promise<SavedRegistrationSettings> {
  const { data, error } = await supabase.rpc("configure_event_registration", {
    p_event_id: eventId,
    p_settings: values.required
      ? {
          required: true,
          opensAt: singaporeLocalToIso(values.opensAt),
          closesAt: singaporeLocalToIso(values.closesAt),
          capacity: values.capacity.trim(),
          waitlistEnabled: values.waitlistEnabled,
          withdrawalPermitted: values.withdrawalPermitted,
        }
      : { required: false },
  });

  if (error || !data) {
    throw new Error(error?.message || "The registration settings could not be saved.");
  }

  return {
    required: data.registration_required,
    opensAt: data.registration_opens_at,
    closesAt: data.registration_closes_at,
    capacity: data.attendee_capacity,
    waitlistEnabled: data.waitlist_enabled,
    withdrawalPermitted: data.withdrawal_permitted,
  };
}
