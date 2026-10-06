import {
  equipmentInitialUnitsSchema,
  equipmentItemSchema,
  type EquipmentItemFormValues,
} from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStableCallback } from "@/features/equipment/hooks/use-stable-callback";
import { Modal } from "@/features/event-requests/components/modal";
import type { InventoryItem } from "@/features/equipment/services/equipment-unavailability";

/** Add a catalogue item (with its first units) or edit an existing one. */
export function EquipmentItemDialog({
  item,
  categories,
  onCancel,
  onSave,
}: {
  /** Undefined to add a new item. */
  item?: InventoryItem;
  categories: string[];
  onCancel: () => void;
  onSave: (values: EquipmentItemFormValues, units: number) => Promise<void>;
}) {
  const [values, setValues] = useState<EquipmentItemFormValues>({
    name: item?.name ?? "",
    category: item?.category ?? "",
    code: item?.code ?? "",
  });
  const [units, setUnits] = useState("10");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const closeDialog = useStableCallback(() => {
    if (!saving) onCancel();
  });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Record<string, string> = {};
    const parsed = equipmentItemSchema.safeParse(values);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
    }
    const unitsParsed = equipmentInitialUnitsSchema.safeParse(units);
    if (!item && !unitsParsed.success) next.units = unitsParsed.error.issues[0]?.message ?? "";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    try {
      await onSave(values, item ? 0 : Number(units));
    } catch (cause) {
      setErrors({ form: cause instanceof Error ? cause.message : "This item could not be saved." });
    } finally {
      setSaving(false);
    }
  }

  // Editing a field clears its error, so its hint comes back.
  const set = (key: keyof EquipmentItemFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const code = values.code.trim().toLowerCase() || "code";

  return (
    <Modal
      titleId="equipment-item-dialog-title"
      title={item ? `Edit ${item.name}` : "Add equipment"}
      onCancel={closeDialog}
    >
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <DialogField label="Name" htmlFor="item-name" error={errors.name}>
          <Input
            id="item-name"
            value={values.name}
            maxLength={120}
            placeholder="e.g. Wireless microphone"
            aria-invalid={Boolean(errors.name)}
            onChange={(event) => set("name", event.target.value)}
          />
        </DialogField>
        <DialogField label="Category" htmlFor="item-category" error={errors.category}>
          <Input
            id="item-category"
            list="equipment-categories"
            value={values.category}
            maxLength={60}
            placeholder="e.g. Audio"
            aria-invalid={Boolean(errors.category)}
            onChange={(event) => set("category", event.target.value)}
          />
          <datalist id="equipment-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </DialogField>
        <DialogField
          label="Code"
          htmlFor="item-code"
          error={errors.code}
          hint={`Units are labelled ${code}-1, ${code}-2, …`}
        >
          <Input
            id="item-code"
            value={values.code}
            maxLength={20}
            placeholder="e.g. mic"
            aria-invalid={Boolean(errors.code)}
            onChange={(event) => set("code", event.target.value)}
          />
        </DialogField>
        {!item && (
          <DialogField label="Number of units" htmlFor="item-units" error={errors.units}>
            <Input
              id="item-units"
              type="number"
              min="0"
              max="1000"
              step="1"
              value={units}
              aria-invalid={Boolean(errors.units)}
              onChange={(event) => setUnits(event.target.value)}
            />
          </DialogField>
        )}
        {errors.form && (
          <p role="alert" className="text-sm text-red-700">
            {errors.form}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : item ? "Save changes" : "Add equipment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DialogField({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-slate-900">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
