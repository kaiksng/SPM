import {
  equipmentArrangementSchema,
  equipmentArrangementStatusLabels,
  equipmentArrangementStatuses,
  type EquipmentArrangementFormValues,
  type EquipmentArrangementState,
} from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import { Modal } from "@/features/event-requests/components/modal";

const NOTE_LIMIT = 1000;

/**
 * SPM-28: set a requirement's arrangement status and note (AC04). Opens on
 * the current values, so it can be used again as work progresses (AC05).
 * The database re-checks everything; its refusal is shown here.
 */
export function ArrangementDialog({
  eventTitle,
  equipmentName,
  arrangement,
  canArrange = true,
  onCancel,
  onSave,
}: {
  eventTitle: string;
  equipmentName: string;
  arrangement: EquipmentArrangementState;
  /** False until the full quantity is reserved: Arranged means the stock is held. */
  canArrange?: boolean;
  onCancel: () => void;
  onSave: (values: EquipmentArrangementFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<EquipmentArrangementFormValues>({
    status: arrangement.status,
    note: arrangement.note ?? "",
  });
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cancel = useStableCallback(() => {
    if (!busy) onCancel();
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = equipmentArrangementSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the arrangement details.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onSave(parsed.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This could not be saved.");
      setBusy(false);
    }
  }

  return (
    <Modal titleId="arrangement-dialog-title" title={`Update ${equipmentName} arrangement`} onCancel={cancel}>
      <form onSubmit={submit} noValidate className="mt-3 space-y-4 text-sm">
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
          {eventTitle}
        </p>
        <div>
          <label htmlFor="arrangement-status" className="mb-1 block font-medium text-slate-900">
            Arrangement status
          </label>
          <select
            id="arrangement-status"
            className="border-input h-9 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
            value={values.status}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                status: event.target.value as EquipmentArrangementFormValues["status"],
              }))
            }
          >
            {equipmentArrangementStatuses.map((status) => (
              <option key={status} value={status} disabled={status === "arranged" && !canArrange}>
                {equipmentArrangementStatusLabels[status]}
                {status === "arranged" && !canArrange ? " (reserve the full quantity first)" : ""}
              </option>
            ))}
          </select>
          {!canArrange && (
            <p className="mt-1 text-xs text-slate-500">
              Arranged needs the full quantity reserved, so the stock is held for this event.
            </p>
          )}
        </div>
        <div>
          <label htmlFor="arrangement-note" className="mb-1 block font-medium text-slate-900">
            Note <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id="arrangement-note"
            rows={4}
            value={values.note}
            placeholder="e.g. Borrowing 2 extra from Block B"
            aria-invalid={Boolean(error)}
            onChange={(event) => setValues((current) => ({ ...current, note: event.target.value }))}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-red-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            {values.note.trim().length} / {NOTE_LIMIT} characters
          </p>
        </div>

        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
