import { venueSafetyChecksSchema, type SafetyCheckFlag, type VenueSafetyChecksValues } from "@spm/shared";
import { CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { saveVenueSafetyChecks } from "@/features/safety-check/services/safety-plan";

export type VenueSafetyChecks = {
  emergencyAccessChecked: boolean;
  emergencyAccess: string | null;
  restrictionsChecked: boolean;
  restrictions: string | null;
  crowdMovementChecked: boolean;
  crowdMovementPlan: string | null;
};

const CHECKS = [
  {
    flag: "emergency_access",
    checked: "emergencyAccessChecked",
    details: "emergencyAccess",
    label: "Emergency access checked",
    placeholder: "Optional: exits, evacuation route, assembly point.",
  },
  {
    flag: "restrictions",
    checked: "restrictionsChecked",
    details: "restrictions",
    label: "Known restrictions checked",
    placeholder: "Optional: e.g. no open flames, standing limit, noise curfew.",
  },
  {
    flag: "crowd_movement",
    checked: "crowdMovementChecked",
    details: "crowdMovementPlan",
    label: "Crowd movement planned",
    placeholder: "Optional: how people enter, leave and queue; where ushers stand.",
  },
] as const;

function toFormValues(checks: VenueSafetyChecks): VenueSafetyChecksValues {
  return {
    emergencyAccessChecked: checks.emergencyAccessChecked,
    emergencyAccess: checks.emergencyAccess ?? "",
    restrictionsChecked: checks.restrictionsChecked,
    restrictions: checks.restrictions ?? "",
    crowdMovementChecked: checks.crowdMovementChecked,
    crowdMovementPlan: checks.crowdMovementPlan ?? "",
  };
}

/**
 * SPM-90: the safety checks at the bottom of the Venue step. The assigned
 * coordinator ticks each once checked, adding details where the Safety
 * Officer should know something; all three must be ticked before the event
 * can be submitted for the safety check. Read-only for everyone else, and
 * once the event has left Planning. A check the Safety Officer flagged comes
 * back unticked with their reason; ticking and saving it clears the flag.
 */
export function VenueSafetyChecksSection({
  eventId,
  checks,
  flags = [],
  flagReason = null,
  canEdit,
  onSaved,
}: {
  eventId: string;
  checks: VenueSafetyChecks;
  flags?: SafetyCheckFlag[];
  flagReason?: string | null;
  canEdit: boolean;
  /** The saved checks, and the flags still open after saving. */
  onSaved: (checks: VenueSafetyChecks, remainingFlags: SafetyCheckFlag[]) => void;
}) {
  const [values, setValues] = useState<VenueSafetyChecksValues>(() => toFormValues(checks));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  function update<K extends keyof VenueSafetyChecksValues>(key: K, value: VenueSafetyChecksValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    const parsed = venueSafetyChecksSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      const result = await saveVenueSafetyChecks(eventId, parsed.data);
      onSaved(
        {
          ...result,
          emergencyAccess: result.emergencyAccess || null,
          restrictions: result.restrictions || null,
          crowdMovementPlan: result.crowdMovementPlan || null,
        },
        // The same rule as set_event_venue_safety_checks: ticking clears a flag.
        flags.filter((flag) => !CHECKS.some((check) => check.flag === flag && result[check.checked])),
      );
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The safety checks could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label="Safety checks" className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Safety checks</h2>
      <p className="mt-1 text-sm text-slate-600">
        Tick each once checked. All three are needed before the Safety Officer can review the event; add
        details where they should know something.
      </p>

      <ul className="mt-4 space-y-4">
        {CHECKS.map((check) => {
          const ticked = values[check.checked];
          const details = values[check.details];
          const flagged = flags.includes(check.flag);
          return (
            <li
              key={check.checked}
              className={flagged ? "rounded-xl border border-amber-300 bg-amber-50 p-3" : undefined}
            >
              {flagged && (
                <p className="mb-2 text-sm font-medium text-amber-900">
                  The Safety Officer asked for this to be revised{flagReason ? `: ${flagReason}` : "."}
                </p>
              )}
              {canEdit ? (
                <>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={ticked}
                      disabled={saving}
                      onChange={(event) => update(check.checked, event.target.checked)}
                    />
                    {check.label}
                  </label>
                  <textarea
                    aria-label={`${check.label}: details`}
                    value={details}
                    disabled={saving}
                    onChange={(event) => update(check.details, event.target.value)}
                    placeholder={check.placeholder}
                    rows={2}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 mt-2 w-full rounded-lg border bg-transparent px-2.5 py-2 text-sm shadow-xs outline-none focus-visible:ring-3"
                  />
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    {ticked ? (
                      <CheckCircle2 className="size-4 text-emerald-600" role="img" aria-label="Checked" />
                    ) : (
                      <Circle className="size-4 text-amber-600" role="img" aria-label="Not checked" />
                    )}
                    {check.label}
                  </p>
                  {details && <p className="mt-1 ml-6 whitespace-pre-wrap text-sm text-slate-600">{details}</p>}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && <span role="status" className="text-sm text-emerald-700">Safety checks saved.</span>}
          <Button type="button" disabled={saving} onClick={handleSave}>
            {saving ? "Saving…" : "Save safety checks"}
          </Button>
        </div>
      )}
    </section>
  );
}
