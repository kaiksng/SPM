import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { Button } from "@/components/ui/button";
import { Modal } from "@/features/event-requests/components/modal";
import {
  listAssignedEvents,
  type AssignedEventSummary,
} from "@/features/event-requests/services/assigned-events";
import { OPEN_EQUIPMENT_REQUEST_STATE } from "@/features/event-requests/utils/equipment-request-navigation";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * Equipment is always requested for one event, so the catalogue's
 * "Equipment request" asks which: the coordinator's own events in Planning,
 * the only ones whose equipment can be changed. Choosing one opens its
 * Equipment page with the Request equipment dialog ready.
 */
export function ChooseEquipmentEventDialog({
  coordinatorId,
  onCancel,
}: {
  coordinatorId: string;
  onCancel: () => void;
}) {
  const navigate = useNavigate();
  const [events, setEvents] = useState<AssignedEventSummary[]>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    listAssignedEvents(coordinatorId)
      .then((assigned) => {
        if (active) setEvents(assigned.filter((event) => event.status === "planning"));
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "We couldn't load your assigned events.");
        }
      });
    return () => {
      active = false;
    };
  }, [coordinatorId]);

  return (
    <Modal titleId="choose-equipment-event-title" title="Request equipment for which event?" onCancel={onCancel}>
      <div className="mt-4 space-y-4 text-sm">
        {error ? (
          <p role="alert" className="text-red-700">{error}</p>
        ) : !events ? (
          <p className="text-slate-500">Loading your events…</p>
        ) : events.length === 0 ? (
          <p className="text-slate-600">
            None of your events are in Planning. Equipment can be requested once an event you coordinate is in
            Planning.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => (
              <li key={event.id}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/events/${event.id}/equipment`, { state: OPEN_EQUIPMENT_REQUEST_STATE })
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-primary/40 hover:bg-accent/40"
                >
                  <span className="block font-medium text-slate-900">{event.title}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {event.startsAt ? dateTimeFormatter.format(new Date(event.startsAt)) : "No date set"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </Modal>
  );
}
