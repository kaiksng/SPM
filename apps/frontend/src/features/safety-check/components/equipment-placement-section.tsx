import { equipmentPlacementSchema } from "@spm/shared";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { saveEquipmentPlacement } from "@/features/safety-check/services/safety-plan";

/**
 * SPM-90: the safety check at the bottom of the Equipment step — where the
 * equipment goes, as open text. Required before the safety check when the
 * event has equipment. Editable by the assigned coordinator during Planning.
 * When the Safety Officer flagged it, their reason is shown until it's saved
 * again.
 */
export function EquipmentPlacementSection({
  eventId,
  equipmentPlacement,
  flagged = false,
  flagReason = null,
  canEdit,
  onSaved,
}: {
  eventId: string;
  equipmentPlacement: string | null;
  flagged?: boolean;
  flagReason?: string | null;
  canEdit: boolean;
  onSaved: (equipmentPlacement: string | null) => void;
}) {
  const [value, setValue] = useState(equipmentPlacement ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const parsed = equipmentPlacementSchema.safeParse({ equipmentPlacement: value });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const result = await saveEquipmentPlacement(eventId, parsed.data);
      onSaved(result.equipmentPlacement || null);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The equipment placement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Safety check" className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Safety check</h2>
      <p className="mt-1 text-sm text-slate-600">
        Where the equipment will be placed. Needed before the Safety Officer can review the event.
      </p>
      {flagged && (
        <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900">
          The Safety Officer asked for this to be revised{flagReason ? `: ${flagReason}` : "."}
        </p>
      )}
      {canEdit ? (
        <>
          <textarea
            aria-label="Equipment placement"
            value={value}
            disabled={saving}
            onChange={(event) => {
              setValue(event.target.value);
              setSaved(false);
            }}
            placeholder="Where each piece of equipment goes, and how cables are run."
            rows={3}
            className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-4 w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
          />
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex items-center justify-end gap-3">
            {saved && <span role="status" className="text-sm text-emerald-700">Equipment placement saved.</span>}
            <Button type="button" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save equipment placement"}
            </Button>
          </div>
        </>
      ) : (
        <p
          className={
            equipmentPlacement
              ? "mt-4 whitespace-pre-wrap text-sm text-slate-900"
              : "mt-4 text-sm font-medium text-amber-700"
          }
        >
          {equipmentPlacement ?? "Not provided yet"}
        </p>
      )}
    </section>
  );
}
