import {
  equipmentArrangementSchema,
  equipmentArrangementStatusLabels,
  type EquipmentArrangementFormValues,
  type EquipmentArrangementState,
  type EquipmentArrangementStatus,
} from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import { Modal } from "@/features/event-requests/components/modal";

const NOTE_LIMIT = 1000;

/**
 * What a hand-made arrangement update is for, now that reserving records
 * Arranged / In progress / Not started itself (202610290003):
 *   report  — something is wrong: the status becomes Issue, with a note saying what;
 *   note    — add a note, leaving the status as it is;
 *   resolve — the reported issue is fixed: back to what the reservation says.
 */
export type ArrangementDialogMode = "report" | "note" | "resolve";

/**
 * SPM-28: change a requirement's arrangement status and/or note (AC04), as
 * often as needed, including back to an earlier status (AC05). Each mode
 * fixes the status it saves; the database re-checks everything and its
 * refusal is shown here.
 */
export function ArrangementDialog({
  mode,
  eventTitle,
  equipmentName,
  arrangement,
  status,
  onCancel,
  onSave,
}: {
  mode: ArrangementDialogMode;
  eventTitle: string;
  equipmentName: string;
  arrangement: EquipmentArrangementState;
  /** The status this saves: Issue to report, the current one for a note, the reservation's to resolve. */
  status: EquipmentArrangementStatus;
  onCancel: () => void;
  onSave: (values: EquipmentArrangementFormValues) => Promise<void>;
}) {
  // A note starts from the current one, so it can be edited as work goes on.
  const [note, setNote] = useState(mode === "note" ? (arrangement.note ?? "") : "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cancel = useStableCallback(() => {
    if (!busy) onCancel();
  });
  const noteRequired = mode !== "resolve";
  const statusLabel = equipmentArrangementStatusLabels[status];

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (noteRequired && !note.trim()) {
      setError(mode === "report" ? "Say what the problem is." : "Write a note.");
      return;
    }
    const parsed = equipmentArrangementSchema.safeParse({ status, note });
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

  const title =
    mode === "report"
      ? `Report an issue with ${equipmentName}`
      : mode === "resolve"
        ? `Resolve the ${equipmentName} issue`
        : `Add a note to ${equipmentName}`;
  const explanation =
    mode === "report"
      ? "It shows under Issue until the problem is resolved."
      : mode === "resolve"
        ? `It goes back to ${statusLabel}, from its reservation.`
        : `The status stays ${statusLabel}.`;

  return (
    <Modal titleId="arrangement-dialog-title" title={title} onCancel={cancel}>
      <form onSubmit={submit} noValidate className="mt-3 space-y-4 text-sm">
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium tracking-wide text-slate-500 uppercase">
          {eventTitle}
        </p>
        <p className="text-slate-600">{explanation}</p>
        <div>
          <label htmlFor="arrangement-note" className="mb-1 block font-medium text-slate-900">
            {mode === "report" ? "What is wrong" : mode === "resolve" ? "How it was resolved" : "Note"}
            {!noteRequired && <span className="font-normal text-slate-500"> (optional)</span>}
          </label>
          <textarea
            id="arrangement-note"
            rows={4}
            value={note}
            placeholder={
              mode === "report"
                ? "e.g. One projector is faulty"
                : mode === "resolve"
                  ? "e.g. Replaced with a spare from Block B"
                  : "e.g. Borrowing 2 extra from Block B"
            }
            aria-invalid={Boolean(error)}
            onChange={(event) => setNote(event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-red-600"
          />
          <p className="mt-1 text-xs text-slate-500">
            {note.trim().length} / {NOTE_LIMIT} characters
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
            {busy ? "Saving…" : mode === "report" ? "Report issue" : mode === "resolve" ? "Resolve issue" : "Save note"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
