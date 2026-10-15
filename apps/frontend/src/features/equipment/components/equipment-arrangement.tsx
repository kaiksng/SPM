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

/**
 * SPM-28: the requirement's current arrangement status (AC01/AC02), marked
 * "(automatic)" when it was worked out rather than set by a person.
 */
export function ArrangementBadge({ arrangement }: { arrangement: EquipmentArrangementState }) {
  const { status } = arrangement;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusStyles[status])}>
      Arrangement: {equipmentArrangementStatusLabels[status]}
      {arrangement.automatic && status !== "not_started" && (
        <span className="font-normal"> (automatic)</span>
      )}
    </span>
  );
}

/**
 * SPM-28: the latest note, who last updated it and when (AC04), and every
 * earlier update, oldest first (AC03).
 */
export function ArrangementDetails({ arrangement }: { arrangement: EquipmentArrangementState }) {
  if (arrangement.history.length === 0) return null;
  return (
    <div className="mt-2 text-sm">
      {arrangement.note && (
        <p className="whitespace-pre-line text-slate-700">
          <span className="font-medium text-slate-800">Arrangement note:</span> {arrangement.note}
        </p>
      )}
      <p className="mt-0.5 text-xs text-slate-500">
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
