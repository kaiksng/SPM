import {
  isoToSingaporeLocal,
  registrationExceedsVenueCapacity,
  registrationSettingsSchema,
  type RegistrationSettingsFormValues,
} from "@spm/shared";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  loadMainVenueCapacity,
  saveRegistrationSettings,
  type SavedRegistrationSettings,
} from "@/features/registrations/services/registration-settings";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

function formatDateTime(value: string | null) {
  return value ? dateTimeFormatter.format(new Date(value)) : "Not set";
}

type FieldErrors = Partial<Record<keyof RegistrationSettingsFormValues, string>>;

const REQUEST_STAGES: readonly string[] = ["draft", "requested", "clarification_requested"];

function toFormValues(registration: SavedRegistrationSettings): RegistrationSettingsFormValues {
  return {
    required: registration.required,
    opensAt: registration.opensAt ? isoToSingaporeLocal(registration.opensAt) : "",
    closesAt: registration.closesAt ? isoToSingaporeLocal(registration.closesAt) : "",
    capacity: registration.capacity?.toString() ?? "",
    waitlistEnabled: registration.waitlistEnabled,
    withdrawalPermitted: registration.withdrawalPermitted,
  };
}

/**
 * Configure Event Registration. Everyone who can see the event sees the
 * rules; only the event's own organiser can change them, and only while it
 * is in Planning (AC02, AC07). The request form only asks whether
 * registration is required (AC01).
 */
export function RegistrationSettingsSection({
  eventId,
  status,
  registration,
  isOwnOrganiser,
  onSaved,
}: {
  eventId: string;
  status: string;
  registration: SavedRegistrationSettings;
  isOwnOrganiser: boolean;
  onSaved: (registration: SavedRegistrationSettings) => void;
}) {
  const canEdit = isOwnOrganiser && status === "planning";
  const [venueCapacity, setVenueCapacity] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<RegistrationSettingsFormValues>(() => toFormValues(registration));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  // AC08: only the organiser needs the venue cap, and only while they can
  // still act on it.
  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    loadMainVenueCapacity(eventId)
      .then((capacity) => {
        if (active) setVenueCapacity(capacity);
      })
      .catch(() => {
        // The save is still capped by the database; only the hint is lost.
      });
    return () => {
      active = false;
    };
  }, [canEdit, eventId]);

  const incomplete =
    registration.required &&
    (!registration.opensAt || !registration.closesAt || registration.capacity === null);
  const overCapacity =
    registration.required && registrationExceedsVenueCapacity(registration.capacity, venueCapacity);

  function set<Key extends keyof RegistrationSettingsFormValues>(
    key: Key,
    value: RegistrationSettingsFormValues[Key],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function startEditing() {
    setValues(toFormValues(registration));
    setFieldErrors({});
    setError(undefined);
    setEditing(true);
  }

  async function handleSave() {
    setError(undefined);

    // AC03/AC04/AC05/AC08: every problem shown before the round trip.
    const result = registrationSettingsSchema(venueCapacity).safeParse(values);
    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof RegistrationSettingsFormValues;
        errors[key] ??= issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    try {
      onSaved(await saveRegistrationSettings(eventId, values));
      setEditing(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "The registration settings could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Registration</h2>
        {canEdit && !editing && (
          <Button type="button" variant="outline" size="sm" onClick={startEditing}>
            Edit
          </Button>
        )}
      </div>

      {canEdit && !editing && incomplete && (
        <p role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Complete the registration settings. The event can't go to the safety check until they're set.
        </p>
      )}
      {canEdit && !editing && overCapacity && (
        <p role="status" className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Capacity ({registration.capacity}) is more than the main venue's capacity ({venueCapacity}).
          Lower it before the safety check.
        </p>
      )}

      {editing ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-primary"
              checked={values.required}
              onChange={(event) => set("required", event.target.checked)}
            />
            <span className="text-sm font-semibold text-slate-900">Attendee registration is required</span>
          </label>

          {values.required && (
            <>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-slate-400">Opens (Singapore time)</span>
                <Input
                  type="datetime-local"
                  value={values.opensAt}
                  aria-invalid={!!fieldErrors.opensAt}
                  onChange={(event) => set("opensAt", event.target.value)}
                />
                {fieldErrors.opensAt && <span className="text-xs text-red-700">{fieldErrors.opensAt}</span>}
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-slate-400">Closes (Singapore time)</span>
                <Input
                  type="datetime-local"
                  value={values.closesAt}
                  aria-invalid={!!fieldErrors.closesAt}
                  onChange={(event) => set("closesAt", event.target.value)}
                />
                {fieldErrors.closesAt && <span className="text-xs text-red-700">{fieldErrors.closesAt}</span>}
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-xs font-medium text-slate-400">Capacity</span>
                <Input
                  inputMode="numeric"
                  value={values.capacity}
                  aria-invalid={!!fieldErrors.capacity}
                  onChange={(event) => set("capacity", event.target.value)}
                />
                {venueCapacity !== null && (
                  <span className="text-xs text-slate-500">Main venue capacity: {venueCapacity}</span>
                )}
                {fieldErrors.capacity && <span className="text-xs text-red-700">{fieldErrors.capacity}</span>}
              </label>
              <div className="hidden sm:block" />
              <YesNo
                legend="Waiting list"
                name="waitlistEnabled"
                value={values.waitlistEnabled}
                onChange={(value) => set("waitlistEnabled", value)}
              />
              <YesNo
                legend="Attendees may withdraw"
                name="withdrawalPermitted"
                value={values.withdrawalPermitted}
                onChange={(value) => set("withdrawalPermitted", value)}
              />
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 sm:col-span-2">
            <Button type="button" disabled={saving} onClick={handleSave}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : registration.required ? (
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Opens" value={formatDateTime(registration.opensAt)} />
          <Field label="Closes" value={formatDateTime(registration.closesAt)} />
          <Field label="Capacity" value={registration.capacity?.toString() ?? "Not set"} />
          <Field label="Waitlist" value={registration.waitlistEnabled ? "Enabled" : "Disabled"} />
          <Field label="Withdrawal" value={registration.withdrawalPermitted ? "Permitted" : "Not permitted"} />
        </dl>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Registration is not required</p>
      )}

      {isOwnOrganiser && REQUEST_STAGES.includes(status) && registration.required && (
        <p className="mt-4 text-sm text-slate-500">
          You can set the registration rules once your event reaches Planning.
        </p>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function YesNo({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5 text-sm">
      <legend className="text-xs font-medium text-slate-400">{legend}</legend>
      <div className="mt-1.5 flex gap-4">
        <label className="flex items-center gap-2">
          <input type="radio" name={name} checked={value} onChange={() => onChange(true)} className="accent-primary" />
          Yes
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" name={name} checked={!value} onChange={() => onChange(false)} className="accent-primary" />
          No
        </label>
      </div>
    </fieldset>
  );
}
