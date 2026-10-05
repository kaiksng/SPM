import {
  changedEquipmentFields,
  equipmentChangeTypeLabels,
  equipmentSnapshotFieldLabels,
  type EquipmentSnapshot,
  type EquipmentSnapshotField,
} from "@spm/shared";

import type { EquipmentChange } from "@/features/event-requests/services/equipment";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

function formatValue(snapshot: EquipmentSnapshot, field: EquipmentSnapshotField) {
  const value = snapshot[field];
  if (value === null || value === "") return "Not set";
  if (field === "requiredFrom" || field === "requiredUntil") {
    return dateTimeFormatter.format(new Date(value as string));
  }
  return String(value);
}

function describe(snapshot: EquipmentSnapshot) {
  const period =
    snapshot.requiredFrom && snapshot.requiredUntil
      ? `, ${formatValue(snapshot, "requiredFrom")} – ${formatValue(snapshot, "requiredUntil")}`
      : "";
  return `${snapshot.equipmentName} × ${snapshot.quantity}${period}`;
}

/** AC07: every add, change and removal, oldest first, with actor and time. */
export function EquipmentHistoryList({ changes }: { changes: EquipmentChange[] }) {
  if (changes.length === 0) {
    return <p className="text-sm text-slate-500">No equipment changes recorded yet.</p>;
  }

  return (
    <ol className="space-y-3">
      {changes.map((change) => {
        const { previous, next } = change;
        const subject = next ?? previous;
        const fields =
          change.changeType === "changed" && previous && next
            ? changedEquipmentFields(previous, next)
            : [];

        return (
          <li
            key={change.id}
            className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 text-sm"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="font-medium text-slate-800">
                {equipmentChangeTypeLabels[change.changeType]}
                {subject ? ` · ${subject.equipmentName}` : ""}
              </span>
              <span className="text-xs text-slate-500">
                {dateTimeFormatter.format(new Date(change.changedAt))}
                {change.changedByName ? ` · ${change.changedByName}` : ""}
              </span>
            </div>
            {change.changeType !== "changed" && subject && (
              <p className="mt-1 text-slate-600">{describe(subject)}</p>
            )}
            {fields.length > 0 && previous && next && (
              <ul className="mt-1 space-y-0.5 text-slate-600">
                {fields.map((field) => (
                  <li key={field}>
                    <span className="font-medium">{equipmentSnapshotFieldLabels[field]}:</span>{" "}
                    <span className="text-slate-400 line-through">
                      {formatValue(previous, field)}
                    </span>{" "}
                    → <span className="text-slate-800">{formatValue(next, field)}</span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
