import { CheckCircle2, Circle } from "lucide-react";
import { Link } from "react-router";

/**
 * SPM-90: a small read-only summary of the coordinator's safety checks on
 * the event page. They are filled in on the Venue and Equipment steps.
 */
export function SafetyPlanSummary({
  eventId,
  emergencyAccessChecked,
  restrictionsChecked,
  crowdMovementChecked,
  equipmentPlacement,
  equipmentPlacementFlagged = false,
  hasEquipment,
}: {
  eventId: string;
  emergencyAccessChecked: boolean;
  restrictionsChecked: boolean;
  crowdMovementChecked: boolean;
  equipmentPlacement: string | null;
  /** The Safety Officer asked for it to be revised; not done until saved again. */
  equipmentPlacementFlagged?: boolean;
  hasEquipment: boolean;
}) {
  const items = [
    { label: "Emergency access checked", done: emergencyAccessChecked },
    { label: "Known restrictions checked", done: restrictionsChecked },
    { label: "Crowd movement planned", done: crowdMovementChecked },
    ...(hasEquipment ? [{ label: "Equipment placement recorded", done: Boolean(equipmentPlacement) && !equipmentPlacementFlagged }] : []),
  ];

  return (
    <section aria-label="Safety checks" className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Safety checks</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm text-slate-700">
            {item.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-600" role="img" aria-label="Done" />
            ) : (
              <Circle className="size-4 shrink-0 text-amber-600" role="img" aria-label="Not done" />
            )}
            {item.label}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-slate-500">
        Recorded on the{" "}
        <Link to={`/events/${eventId}/venue`} className="font-medium text-primary hover:underline">
          Venue step
        </Link>
        {hasEquipment && (
          <>
            {" "}and the{" "}
            <Link to={`/events/${eventId}/equipment`} className="font-medium text-primary hover:underline">
              Equipment step
            </Link>
          </>
        )}
        .
      </p>
    </section>
  );
}
