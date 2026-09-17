import { ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import { StatusBadge } from "@/features/event-requests/components/status-badges";
import { listEventStatusHistory } from "@/features/event-requests/services/event-lifecycle";

/**
 * A compact, always-visible "Draft → Requested → Planning" strip, so the
 * lifecycle is visible at a glance rather than only inside the change-history
 * dialog's "Lifecycle" section (which stays too, alongside clarifications and
 * field edits — this is just the quick-glance version). Reads the same
 * event_status_history data via listEventStatusHistory.
 */
export function EventStatusTimeline({ eventId }: { eventId: string }) {
  const [statuses, setStatuses] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    listEventStatusHistory(eventId)
      .then((rows) => {
        if (active) setStatuses(rows.map((row) => row.toStatus));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [eventId]);

  if (!loaded || statuses.length < 2) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {statuses.map((status, index) => (
        <span key={`${status}-${index}`} className="flex items-center gap-1.5">
          {index > 0 && (
            <ChevronRight className="size-3.5 shrink-0 text-slate-300" aria-hidden="true" />
          )}
          <StatusBadge status={status} />
        </span>
      ))}
    </div>
  );
}
