import { isLocationArea } from "@spm/shared";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router";

import type { EventDetail } from "@/features/event-requests/services/event-details";
import { ManualVenueSearch } from "@/features/venues/components/manual-venue-search";

/**
 * SPM-85: "Add another venue" for an event that already has a booking, such as
 * a breakout room next to the main hall. Reuses the venue search, started from
 * this booking's own details, and defaults it to the main venue's area.
 */
export function AdditionalVenuePanel({
  event,
  mainVenueArea,
}: {
  event: EventDetail;
  // The main venue's area, so a breakout room is looked for in the same place.
  mainVenueArea: string | null;
}) {
  const location = useLocation();
  const [open, setOpen] = useState(Boolean((location.state as { additional?: boolean } | null)?.additional));
  const defaultLocation = mainVenueArea && isLocationArea(mainVenueArea) ? mainVenueArea : "";

  return (
    <section aria-label="Add another venue" className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Add another venue</h2>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Close" : <><Plus className="size-4" aria-hidden="true" />Add another venue</>}
        </button>
      </div>
      {!open && (
        <p className="mt-2 text-sm text-slate-600">
          Book another room for this event, such as a breakout room. It is checked on its own and Venue Staff decide it separately.
        </p>
      )}
      {open && <ManualVenueSearch event={event} hasActiveBooking={false} additional={{ defaultLocation }} />}
    </section>
  );
}
