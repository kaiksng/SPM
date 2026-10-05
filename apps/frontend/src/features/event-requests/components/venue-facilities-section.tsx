import { asRoomLayoutType, LOCATION_AREAS, type RoomLayoutType } from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { AmenityPicker } from "@/components/ui/amenity-picker";
import {
  localDateTime,
  updateEventAsCoordinator,
} from "@/features/event-requests/services/coordinator-event-edit";
import { toEquipmentFormValues } from "@/features/event-requests/services/equipment";
import type { EventDetail } from "@/features/event-requests/services/event-details";
import { useRoomLayoutOptions } from "@/features/venues/hooks/use-room-layout-options";
import { cn } from "@/lib/utils";

type Venue = EventDetail["venue"];

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="border-input focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
    />
  );
}

/**
 * Directly editable in place on EventDetailPage — no separate "Edit event"
 * page for this section. Only venue fields are ever sent to
 * update_event_as_coordinator; every other field (title, schedule,
 * registration, equipment) is resent unchanged from the already-loaded
 * event so those stay exactly as SPM-10 locks them.
 */
export function VenueFacilitiesSection({
  event,
  canEdit,
  onSaved,
}: {
  event: EventDetail;
  canEdit: boolean;
  onSaved: (venue: Venue) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [preferredLocation, setPreferredLocation] = useState("");
  const [accessibilityNotes, setAccessibilityNotes] = useState("");
  const [layoutNotes, setLayoutNotes] = useState<RoomLayoutType | "">("");
  const [facilities, setFacilities] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const roomLayouts = useRoomLayoutOptions();

  function startEditing() {
    setPreferredLocation(event.venue.preferredLocation ?? "");
    setAccessibilityNotes(event.venue.accessibilityNotes ?? "");
    setLayoutNotes(asRoomLayoutType(event.venue.layoutNotes));
    setFacilities(event.venue.facilities);
    setError(undefined);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(undefined);

    try {
      await updateEventAsCoordinator(event.id, {
        title: event.title,
        purpose: event.purpose ?? "",
        description: event.description ?? "",
        eventType: event.eventType ?? "",
        expectedAttendance: event.expectedAttendance?.toString() ?? "",
        startsAt: localDateTime(event.startsAt),
        endsAt: localDateTime(event.endsAt),
        venue: {
          preferredLocation,
          minimumCapacity: event.venue.minimumCapacity?.toString() ?? "",
          accessibilityNotes,
          layoutNotes,
          facilities,
        },
        // Resent with each row's id, so the database sees no equipment change.
        equipment: toEquipmentFormValues(event.equipment),
        registration: {
          required: event.registration.required,
          opensAt: localDateTime(event.registration.opensAt),
          closesAt: localDateTime(event.registration.closesAt),
          capacity: event.registration.capacity?.toString() ?? "",
          waitlistEnabled: event.registration.waitlistEnabled,
        },
        requirementsAcknowledged: true,
      });

      onSaved({
        preferredLocation: preferredLocation || null,
        minimumCapacity: event.venue.minimumCapacity,
        accessibilityNotes: accessibilityNotes || null,
        layoutNotes: layoutNotes || null,
        facilities,
      });
      setEditing(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "This event could not be updated. Your form values are still here.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          Venue &amp; facilities
        </h2>
        {canEdit && !editing && (
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium text-slate-400">Preferred location</span>
            <select
              value={preferredLocation}
              onChange={(event) => setPreferredLocation(event.target.value)}
              className={cn(
                "border-input flex h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm shadow-xs outline-none",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
                !preferredLocation && "text-muted-foreground",
              )}
            >
              <option value="">No preference</option>
              {preferredLocation &&
                !LOCATION_AREAS.includes(preferredLocation as typeof LOCATION_AREAS[number]) && (
                  <option value={preferredLocation} className="text-foreground">
                    {preferredLocation} (previously saved)
                  </option>
                )}
              {LOCATION_AREAS.map((area) => (
                <option key={area} value={area} className="text-foreground">
                  {area}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
            <span className="text-xs font-medium text-slate-400">Accessibility notes</span>
            <TextArea
              rows={3}
              value={accessibilityNotes}
              onChange={(event) => setAccessibilityNotes(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-xs font-medium text-slate-400">Room layout</span>
            <select
              value={layoutNotes}
              onChange={(event) => setLayoutNotes(event.target.value as RoomLayoutType | "")}
              className={cn(
                "border-input flex h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm shadow-xs outline-none",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                !layoutNotes && "text-muted-foreground",
              )}
            >
              <option value="">No preference</option>
              {layoutNotes && !roomLayouts.includes(layoutNotes) && <option value={layoutNotes}>{layoutNotes}</option>}
              {roomLayouts.map((layout) => (
                <option key={layout} value={layout} className="text-foreground">
                  {layout}
                </option>
              ))}
            </select>
          </label>
          <AmenityPicker value={facilities} onChange={setFacilities} />

          {error && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 sm:col-span-2">
            <Button type="button" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-400">Preferred location</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {event.venue.preferredLocation || "Not provided"}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-slate-400">Accessibility notes</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {event.venue.accessibilityNotes || "Not provided"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Room layout</dt>
            <dd className="mt-1 text-sm text-slate-800">{event.venue.layoutNotes || "No preference"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium text-slate-400">Required facilities</dt>
            <dd className="mt-2 flex flex-wrap gap-1.5">
              {event.venue.facilities.length > 0 ? (
                event.venue.facilities.map((facility) => (
                  <span
                    key={facility}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                  >
                    {facility}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">None required</span>
              )}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
