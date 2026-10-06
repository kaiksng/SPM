import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import { Modal } from "@/features/event-requests/components/modal";

/** "Are you sure?" before retiring an item or a unit. */
export function ConfirmRetireDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const cancel = useStableCallback(() => {
    if (!busy) onCancel();
  });

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This could not be retired.");
      setBusy(false);
    }
  }

  return (
    <Modal titleId="confirm-retire-title" title={title} onCancel={cancel}>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="destructive" disabled={busy} onClick={() => void confirm()}>
          {busy ? "Retiring…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
