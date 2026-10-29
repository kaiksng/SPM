import { equipmentRequirementSchema, type EquipmentRequirementFormValues } from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EquipmentSelect } from "@/features/event-requests/components/equipment-select";
import { Modal } from "@/features/event-requests/components/modal";
import { useEquipmentCatalogue } from "@/features/event-requests/hooks/use-equipment-catalogue";

type FieldErrors = Partial<Record<keyof EquipmentRequirementFormValues, string>>;

/**
 * Requests a new equipment item, or edits one, from the Equipment page. The
 * required period is fixed (the event's own period for a new item, the
 * item's saved period when editing) and shown read-only; the full edit page
 * still changes it. Validated with the same rules as EventRequestForm.
 */
export function EquipmentRequestDialog({
  title,
  initialValues,
  periodLabel,
  reserved,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  title: string;
  initialValues: EquipmentRequirementFormValues;
  periodLabel: string;
  /** Technical Support Staff already reserved it, so a change sends it back to them. */
  reserved: boolean;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (values: EquipmentRequirementFormValues) => Promise<unknown>;
}) {
  const catalogue = useEquipmentCatalogue();
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  function setField<K extends keyof EquipmentRequirementFormValues>(key: K, value: EquipmentRequirementFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = equipmentRequirementSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof EquipmentRequirementFormValues;
        fieldErrors[field] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitError(undefined);
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (saveError) {
      setSubmitError(saveError instanceof Error ? saveError.message : "This equipment could not be saved.");
      setSubmitting(false);
    }
  }

  return (
    <Modal titleId="equipment-request-dialog-title" title={title} onCancel={onCancel}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-900">Equipment</span>
          <EquipmentSelect
            value={values.equipmentItemId}
            groups={catalogue.groups}
            placeholder="Select equipment"
            invalid={Boolean(errors.equipmentItemId)}
            onChange={(equipmentItemId) => setField("equipmentItemId", equipmentItemId)}
          />
          {errors.equipmentItemId && (
            <p role="alert" className="mt-1.5 text-red-700">{errors.equipmentItemId}</p>
          )}
          {catalogue.error && <p role="alert" className="mt-1.5 text-red-700">{catalogue.error}</p>}
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-900">Quantity</span>
          <Input
            type="number"
            min="1"
            step="1"
            value={values.quantity}
            onChange={(event) => setField("quantity", event.target.value)}
            aria-invalid={Boolean(errors.quantity)}
          />
          {errors.quantity && <p role="alert" className="mt-1.5 text-red-700">{errors.quantity}</p>}
        </label>
        <div className="text-sm">
          <p className="font-medium text-slate-900">Required period</p>
          <p className="mt-1.5 text-slate-600">{periodLabel}</p>
          {(errors.requiredFrom || errors.requiredUntil) && (
            <p role="alert" className="mt-1.5 text-red-700">{errors.requiredFrom ?? errors.requiredUntil}</p>
          )}
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-slate-900">Technical requirements</span>
          <Input
            value={values.notes}
            onChange={(event) => setField("notes", event.target.value)}
            placeholder="e.g. XLR connection, HDMI input, power near the stage"
            maxLength={1_000}
            aria-invalid={Boolean(errors.notes)}
          />
          {errors.notes && <p role="alert" className="mt-1.5 text-red-700">{errors.notes}</p>}
        </label>
        {reserved && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This item is reserved. Changing it sends it back to Technical Support Staff to check again.
          </p>
        )}
        {submitError && (
          <p role="alert" className="text-sm text-red-700">{submitError}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
