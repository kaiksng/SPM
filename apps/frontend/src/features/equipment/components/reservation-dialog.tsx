import { isPositiveWholeNumber } from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import type { EquipmentAvailabilityResult } from "@/features/equipment/services/equipment-availability";
import { Modal } from "@/features/event-requests/components/modal";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

export type ReservationAction = "reserve" | "change" | "release" | "top_up";

/**
 * Reserve a requested item, change a reservation's quantity, or release it.
 * Availability is checked again by the database when saving; a rejection
 * (e.g. "Only 40 available for this period") is shown here (AC2).
 */
export function ReservationDialog({
  action,
  eventTitle,
  result,
  onCancel,
  onConfirm,
}: {
  action: ReservationAction;
  eventTitle: string;
  result: EquipmentAvailabilityResult;
  onCancel: () => void;
  /** Quantity is the new total reservation, including any existing units. */
  onConfirm: (input: { quantity: number; reason: string }) => Promise<void>;
}) {
  const toppingUp = action === "top_up";
  const alreadyReserved = result.reservation?.quantity ?? 0;
  const remaining = Math.max(result.requestedQuantity - alreadyReserved, 0);
  // Availability excludes this requirement's own reservation: subtract it
  // when presenting additional stock rather than a replacement total.
  const additionalAvailable = Math.max(result.availableQuantity - alreadyReserved, 0);
  const startQuantity = toppingUp
    ? Math.min(remaining, additionalAvailable)
    : (action === "change" && result.reservation
      ? result.reservation.quantity
      : Math.max(Math.min(result.requestedQuantity, result.availableQuantity), 1));
  const [quantity, setQuantity] = useState(String(startQuantity));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cancel = useStableCallback(() => {
    if (!busy) onCancel();
  });

  const totalQuantity = (toppingUp ? alreadyReserved : 0) + Number(quantity);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (action !== "release") {
      if (!isPositiveWholeNumber(quantity)) {
        setError("Enter a positive whole number");
        return;
      }
      if (totalQuantity > result.requestedQuantity) {
        setError(`Cannot reserve more than the ${result.requestedQuantity} requested`);
        return;
      }
      if (toppingUp && Number(quantity) > additionalAvailable) {
        setError(`Only ${additionalAvailable} additional ${additionalAvailable === 1 ? "unit" : "units"} available for this period`);
        return;
      }
    }
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm({ quantity: totalQuantity, reason });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This could not be saved.");
      setBusy(false);
    }
  }

  const title =
    toppingUp
      ? `Reserve more ${result.equipmentName}`
      : action === "reserve"
        ? `Reserve ${result.equipmentName}`
        : action === "change"
          ? `Change ${result.equipmentName} reservation`
          : `Release ${result.equipmentName} reservation`;

  return (
    <Modal titleId="reservation-dialog-title" title={title} onCancel={cancel}>
      <form onSubmit={submit} noValidate className="mt-3 space-y-4 text-sm">
        <dl className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{eventTitle}</dt>
          <dd className="mt-1 text-slate-700">
            {result.requiredFrom && result.requiredUntil
              ? `${dateFormat.format(new Date(result.requiredFrom))} – ${dateFormat.format(new Date(result.requiredUntil))}`
              : "No period recorded"}
          </dd>
          <dd className="mt-1 text-slate-700">
            {toppingUp
              ? `${result.requestedQuantity} required · ${alreadyReserved} already reserved · ${remaining} remaining`
              : `${result.requestedQuantity} requested · ${result.availableQuantity} available for this period`}
          </dd>
          {toppingUp && <dd className="mt-1 text-slate-700">{additionalAvailable} additional {additionalAvailable === 1 ? "unit" : "units"} available for this period</dd>}
        </dl>

        {action === "release" ? (
          <>
            <p className="text-slate-600">
              The {result.reservation?.quantity} reserved will return to the available pool. The release is
              recorded in the reservation history.
            </p>
            <div>
              <label htmlFor="release-reason" className="mb-1 block font-medium text-slate-900">
                Reason <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <Input
                id="release-reason"
                value={reason}
                maxLength={300}
                placeholder="e.g. No longer needed"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="reservation-quantity" className="mb-1 block font-medium text-slate-900">
              {toppingUp ? "Additional quantity to reserve" : "Quantity to reserve"}
            </label>
            <Input
              id="reservation-quantity"
              type="number"
              min="1"
              max={toppingUp ? remaining : result.requestedQuantity}
              step="1"
              className="w-32"
              value={quantity}
              aria-invalid={Boolean(error)}
              onChange={(event) => setQuantity(event.target.value)}
            />
            {toppingUp && isPositiveWholeNumber(quantity) && totalQuantity <= result.requestedQuantity && Number(quantity) <= additionalAvailable && (
              <p className="mt-2 text-slate-600" role="status">After saving: {totalQuantity} of {result.requestedQuantity} reserved.</p>
            )}
          </div>
        )}

        {error && (
          <p role="alert" className="text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" variant={action === "release" ? "destructive" : "default"} disabled={busy}>
            {busy
              ? "Saving…"
              : toppingUp
                ? "Reserve additional units"
                : action === "reserve"
                  ? "Reserve"
                  : action === "change"
                    ? "Save change"
                    : "Release"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Release a reservation whose equipment request was removed. It has no
 * request to change it against, so releasing is the only action; the
 * release and its reason go into the reservation history.
 */
export function ReleaseReservationDialog({
  eventTitle,
  equipmentName,
  quantity,
  startsAt,
  endsAt,
  onCancel,
  onConfirm,
}: {
  eventTitle: string;
  equipmentName: string;
  quantity: number;
  startsAt: string;
  endsAt: string;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const cancel = useStableCallback(() => {
    if (!busy) onCancel();
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(reason);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This could not be saved.");
      setBusy(false);
    }
  }

  return (
    <Modal titleId="release-reservation-title" title={`Release ${equipmentName} reservation`} onCancel={cancel}>
      <form onSubmit={submit} noValidate className="mt-3 space-y-4 text-sm">
        <dl className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{eventTitle}</dt>
          <dd className="mt-1 text-slate-700">
            {dateFormat.format(new Date(startsAt))} – {dateFormat.format(new Date(endsAt))}
          </dd>
        </dl>
        <p className="text-slate-600">
          The equipment request was removed, so the {quantity} reserved will return to the available pool. The release
          is recorded in the reservation history.
        </p>
        <div>
          <label htmlFor="orphan-release-reason" className="mb-1 block font-medium text-slate-900">
            Reason <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <Input
            id="orphan-release-reason"
            value={reason}
            maxLength={300}
            placeholder="e.g. Request removed by the coordinator"
            onChange={(event) => setReason(event.target.value)}
          />
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
          <Button type="submit" variant="destructive" disabled={busy}>
            {busy ? "Saving…" : "Release"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
