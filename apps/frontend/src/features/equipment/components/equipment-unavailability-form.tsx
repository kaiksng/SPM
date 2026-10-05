import {
  effectiveUnavailabilityEnd,
  equipmentUnavailabilitySchema,
  isValidSingaporeLocal,
  periodsOverlap,
  singaporeLocalToIso,
  type EquipmentUnavailabilityFormValues,
} from "@spm/shared";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listOverlappingReservations,
  type EquipmentReservationOverlap,
  type EquipmentUnavailabilityRecord,
  type StockedEquipmentItem,
} from "@/features/equipment/services/equipment-unavailability";

const dateFormat = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

const emptyValues: EquipmentUnavailabilityFormValues = {
  equipmentItemId: "",
  quantity: "1",
  reason: "",
  startsAt: "",
  endsAt: "",
};

const selectClass =
  "border-input h-9 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-red-600";

export function EquipmentUnavailabilityForm({
  items,
  records,
  onSave,
}: {
  items: StockedEquipmentItem[];
  records: EquipmentUnavailabilityRecord[];
  onSave: (values: EquipmentUnavailabilityFormValues) => Promise<void>;
}) {
  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [reservations, setReservations] = useState<EquipmentReservationOverlap[]>([]);
  const [reservationError, setReservationError] = useState<string>();

  // AC03: the period is checkable once an item and a valid, ordered period
  // are chosen — overlaps then show before anything is saved.
  const period =
    values.equipmentItemId &&
    isValidSingaporeLocal(values.startsAt) &&
    isValidSingaporeLocal(values.endsAt) &&
    values.endsAt > values.startsAt
      ? {
          startsAt: singaporeLocalToIso(values.startsAt),
          endsAt: singaporeLocalToIso(values.endsAt),
        }
      : undefined;

  useEffect(() => {
    if (!period) {
      setReservations([]);
      setReservationError(undefined);
      return;
    }
    let active = true;
    listOverlappingReservations(values.equipmentItemId, period.startsAt, period.endsAt)
      .then((rows) => {
        if (active) {
          setReservations(rows);
          setReservationError(undefined);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setReservations([]);
          setReservationError(
            cause instanceof Error ? cause.message : "We couldn't check reservations.",
          );
        }
      });
    return () => {
      active = false;
    };
    // period is derived from these three values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.equipmentItemId, period?.startsAt, period?.endsAt]);

  const overlappingRecords = period
    ? records.filter(
        (record) =>
          record.equipmentItemId === values.equipmentItemId &&
          !record.removedAt &&
          periodsOverlap(
            { startsAt: record.startsAt, endsAt: effectiveUnavailabilityEnd(record) },
            period,
          ),
      )
    : [];
  const selectedItem = items.find((item) => item.id === values.equipmentItemId);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = equipmentUnavailabilitySchema.safeParse(values);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await onSave(parsed.data);
      setValues(emptyValues);
    } catch (cause) {
      setErrors({
        form: cause instanceof Error ? cause.message : "This record could not be saved.",
      });
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof EquipmentUnavailabilityFormValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  const groups = new Map<string, StockedEquipmentItem[]>();
  for (const item of items) {
    const category = item.category ?? "Other";
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }

  return (
    <form onSubmit={submit} noValidate className="mt-5 grid gap-5 sm:grid-cols-2">
      <FormField label="Equipment" htmlFor="unavailability-item" error={errors.equipmentItemId}>
        <select
          id="unavailability-item"
          className={selectClass}
          value={values.equipmentItemId}
          aria-invalid={Boolean(errors.equipmentItemId)}
          onChange={(event) => set("equipmentItemId", event.target.value)}
        >
          <option value="">Select equipment</option>
          {[...groups].map(([category, groupItems]) => (
            <optgroup key={category} label={category}>
              {groupItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </FormField>
      <FormField label="Quantity unavailable" htmlFor="unavailability-quantity" error={errors.quantity}>
        <Input
          id="unavailability-quantity"
          type="number"
          min="1"
          step="1"
          value={values.quantity}
          aria-invalid={Boolean(errors.quantity)}
          onChange={(event) => set("quantity", event.target.value)}
        />
      </FormField>
      <FormField label="Unavailable from" htmlFor="unavailability-starts" error={errors.startsAt}>
        <Input
          id="unavailability-starts"
          type="datetime-local"
          value={values.startsAt}
          aria-invalid={Boolean(errors.startsAt)}
          onChange={(event) => set("startsAt", event.target.value)}
        />
      </FormField>
      <FormField label="Unavailable until" htmlFor="unavailability-ends" error={errors.endsAt}>
        <Input
          id="unavailability-ends"
          type="datetime-local"
          value={values.endsAt}
          aria-invalid={Boolean(errors.endsAt)}
          onChange={(event) => set("endsAt", event.target.value)}
        />
      </FormField>
      <FormField
        label="Reason"
        htmlFor="unavailability-reason"
        error={errors.reason}
        className="sm:col-span-2"
      >
        <Input
          id="unavailability-reason"
          value={values.reason}
          maxLength={500}
          placeholder="e.g. Sent for repair, lamp replacement"
          aria-invalid={Boolean(errors.reason)}
          onChange={(event) => set("reason", event.target.value)}
        />
      </FormField>

      {period && selectedItem && (
        <section
          aria-label="Overlaps for this period"
          className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm"
        >
          <h3 className="font-semibold text-slate-900">Already planned for this period</h3>
          <p className="mt-1 text-slate-600">
            {selectedItem.name}: {selectedItem.totalQuantity} in stock.
          </p>
          {reservationError && (
            <p role="alert" className="mt-2 text-red-700">
              {reservationError}
            </p>
          )}
          {overlappingRecords.length === 0 && reservations.length === 0 && !reservationError ? (
            <p className="mt-2 text-slate-500">No overlapping unavailability or reservations.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {overlappingRecords.map((record) => (
                <li key={record.id} className="text-slate-700">
                  <span className="font-medium">Unavailable × {record.quantity}</span> ·{" "}
                  {record.reason} · {dateFormat.format(new Date(record.startsAt))} –{" "}
                  {dateFormat.format(new Date(effectiveUnavailabilityEnd(record)))}
                </li>
              ))}
              {reservations.map((reservation) => (
                <li key={reservation.id} className="text-slate-700">
                  <span className="font-medium">
                    {reservation.status === "approved" ? "Confirmed" : "Pending"} reservation ×{" "}
                    {reservation.quantity}
                  </span>{" "}
                  · {reservation.eventTitle ?? "Event"} ·{" "}
                  {dateFormat.format(new Date(reservation.startsAt))} –{" "}
                  {dateFormat.format(new Date(reservation.endsAt))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="sm:col-span-2">
        {errors.form && (
          <p role="alert" className="mb-3 text-sm text-red-700">
            {errors.form}
          </p>
        )}
        <Button type="submit" size="lg" disabled={saving}>
          <Plus /> {saving ? "Saving…" : "Record unavailability"}
        </Button>
      </div>
    </form>
  );
}

function FormField({
  label,
  htmlFor,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-900">
        {label}
      </label>
      {children}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
