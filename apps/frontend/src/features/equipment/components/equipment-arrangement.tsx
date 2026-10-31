import {
  equipmentArrangementStatusLabels,
  type EquipmentArrangementState,
  type EquipmentArrangementStatus,
} from "@spm/shared";

import { cn } from "@/lib/utils";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const statusStyles: Record<EquipmentArrangementStatus, string> = {
  not_started: "bg-slate-200 text-slate-700",
  in_progress: "bg-sky-100 text-sky-800",
  arranged: "bg-emerald-100 text-emerald-800",
  issue: "bg-red-100 text-red-800",
};

/** SPM-28: the requirement's arrangement status (AC01), worked out from its reservation (AC02). */
export function ArrangementBadge({ arrangement }: { arrangement: EquipmentArrangementState }) {
  const { status } = arrangement;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusStyles[status])}>
      Arrangement: {equipmentArrangementStatusLabels[status]}
    </span>
  );
}

/** SPM-28: who last updated it and when, and every update, oldest first (AC03). */
export function ArrangementDetails({ arrangement }: { arrangement: EquipmentArrangementState }) {
  if (arrangement.history.length === 0) return null;
  return (
    <div className="mt-2 text-sm">
      <p className="text-xs text-slate-500">
        Updated{arrangement.updatedByName ? ` by ${arrangement.updatedByName}` : ""}
        {arrangement.updatedAt ? ` · ${dateFormat.format(new Date(arrangement.updatedAt))}` : ""}
      </p>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs font-medium text-slate-500">
          Arrangement history ({arrangement.history.length})
        </summary>
        <ol className="mt-2 space-y-1 text-xs text-slate-600">
          {arrangement.history.map((entry) => (
            <li key={entry.id}>
              <span className="font-medium text-slate-700">{equipmentArrangementStatusLabels[entry.status]}</span>
              {entry.note ? ` · ${entry.note}` : ""}
              {" · "}
              {dateFormat.format(new Date(entry.updatedAt))}
              {entry.updatedByName ? ` · ${entry.updatedByName}` : ""}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
