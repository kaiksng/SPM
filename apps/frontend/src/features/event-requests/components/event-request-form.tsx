import {
  EventSubmissionError,
  eventDraftSchema,
  type EventRequestFormValues,
} from "@spm/shared";
import { CirclePlus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ZodType } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type FieldErrors = Record<string, string>;

export function EventRequestForm({
  initialValues,
  onSave,
  onCancel,
  validationSchema = eventDraftSchema,
  submitLabel = "Save draft",
  permittedFields,
}: {
  initialValues: EventRequestFormValues;
  onSave: (values: EventRequestFormValues) => Promise<void>;
  onCancel: () => void;
  validationSchema?: ZodType<EventRequestFormValues>;
  submitLabel?: string;
  /**
   * The bucket keys a coordinator's open clarification permits editing
   * (mirrors public.save_event_draft's lock check, which is the actual
   * enforcement — this only keeps the organiser from filling out a field the
   * server will reject). Undefined means no clarification is open, so
   * nothing is locked.
   */
  permittedFields?: string[];
}) {
  const [values, setValues] = useState(() => structuredClone(initialValues));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);

  const isLocked = (field: string) => {
    if (permittedFields === undefined) return false;
    if (permittedFields.includes(field)) return false;
    // Legacy: a clarification requested before the venue/equipment/
    // registration split (202609150004) stores the single combined
    // "requirements" bucket, which still unlocks all three sections for any
    // round that predates the split.
    if (
      (field === "venue" || field === "equipment" || field === "registration") &&
      permittedFields.includes("requirements")
    ) {
      return false;
    }
    return true;
  };
  const venueLocked = isLocked("venue");
  const equipmentLocked = isLocked("equipment");
  const registrationLocked = isLocked("registration");

  const setRoot = <Key extends keyof EventRequestFormValues>(
    key: Key,
    value: EventRequestFormValues[Key],
  ) => setValues((current) => ({ ...current, [key]: value }));

  const setVenue = <Key extends keyof EventRequestFormValues["venue"]>(
    key: Key,
    value: EventRequestFormValues["venue"][Key],
  ) =>
    setValues((current) => ({
      ...current,
      venue: { ...current.venue, [key]: value },
    }));

  const setRegistration = <
    Key extends keyof EventRequestFormValues["registration"],
  >(
    key: Key,
    value: EventRequestFormValues["registration"][Key],
  ) =>
    setValues((current) => ({
      ...current,
      registration: { ...current.registration, [key]: value },
    }));

  const setEquipment = (
    index: number,
    key: keyof EventRequestFormValues["equipment"][number],
    value: string,
  ) =>
    setValues((current) => ({
      ...current,
      equipment: current.equipment.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);

    const result = validationSchema.safeParse(values);
    if (!result.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      setMessage("Check the highlighted fields and try again.");
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      await onSave(result.data);
    } catch (error) {
      // AC06: a server-side rejection (e.g. submission) highlights every
      // affected field the same way a local validation failure does.
      if (error instanceof EventSubmissionError && error.fieldErrors) {
        setErrors(error.fieldErrors);
      }
      setMessage(
        error instanceof Error
          ? error.message
          : "Your draft could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      <FormSection
        number="01"
        title="Event overview"
        description="Give the request a recognisable name. Everything else can be completed later."
      >
        <Field label="Event name" required error={errors.title} className="sm:col-span-2">
          <Input
            name="title"
            value={values.title}
            onChange={(event) => setRoot("title", event.target.value)}
            placeholder="e.g. Student Leadership Summit"
            maxLength={161}
            aria-invalid={Boolean(errors.title)}
            disabled={isLocked("title")}
          />
        </Field>
        <Field label="Event category" error={errors.eventType}>
          <Input
            name="eventType"
            value={values.eventType}
            onChange={(event) => setRoot("eventType", event.target.value)}
            placeholder="Conference, workshop, ceremony…"
            disabled={isLocked("eventType")}
          />
        </Field>
        <Field label="Expected attendance" error={errors.expectedAttendance}>
          <Input
            name="expectedAttendance"
            inputMode="numeric"
            value={values.expectedAttendance}
            onChange={(event) => setRoot("expectedAttendance", event.target.value)}
            placeholder="Leave blank if unknown"
            aria-invalid={Boolean(errors.expectedAttendance)}
            disabled={isLocked("expectedAttendance")}
          />
        </Field>
        <Field label="Purpose" error={errors.purpose} className="sm:col-span-2">
          <TextArea
            name="purpose"
            value={values.purpose}
            onChange={(event) => setRoot("purpose", event.target.value)}
            placeholder="What should this event achieve?"
            rows={3}
            disabled={isLocked("purpose")}
          />
        </Field>
        <Field label="Description" error={errors.description} className="sm:col-span-2">
          <TextArea
            name="description"
            value={values.description}
            onChange={(event) => setRoot("description", event.target.value)}
            placeholder="Add the working agenda, audience or other planning context."
            rows={5}
            disabled={isLocked("description")}
          />
        </Field>
      </FormSection>

      <FormSection
        number="02"
        title="Proposed schedule"
        description="Drafts can be saved without dates. When both are entered, the end must be later."
      >
        <Field label="Starts" error={errors.startsAt}>
          <Input
            type="datetime-local"
            name="startsAt"
            value={values.startsAt}
            onChange={(event) => setRoot("startsAt", event.target.value)}
            aria-invalid={Boolean(errors.startsAt)}
            disabled={isLocked("startsAt")}
          />
        </Field>
        <Field label="Ends" error={errors.endsAt}>
          <Input
            type="datetime-local"
            name="endsAt"
            value={values.endsAt}
            onChange={(event) => setRoot("endsAt", event.target.value)}
            aria-invalid={Boolean(errors.endsAt)}
            disabled={isLocked("endsAt")}
          />
        </Field>
      </FormSection>

      <FormSection
        number="03"
        title="Venue requirements"
        description="Capture what the event needs, without selecting or booking a venue yet."
      >
        <Field label="Preferred location" error={errors["venue.preferredLocation"]}>
          <Input
            value={values.venue.preferredLocation}
            onChange={(event) => setVenue("preferredLocation", event.target.value)}
            placeholder="Building, campus area or neighbourhood"
            disabled={venueLocked}
          />
        </Field>
        <Field label="Minimum capacity" error={errors["venue.minimumCapacity"]}>
          <Input
            inputMode="numeric"
            value={values.venue.minimumCapacity}
            onChange={(event) => setVenue("minimumCapacity", event.target.value)}
            placeholder="Leave blank if unknown"
            aria-invalid={Boolean(errors["venue.minimumCapacity"])}
            disabled={venueLocked}
          />
        </Field>
        <Field label="Room layout" error={errors["venue.layoutNotes"]}>
          <Input
            value={values.venue.layoutNotes}
            onChange={(event) => setVenue("layoutNotes", event.target.value)}
            placeholder="Theatre, classroom, banquet…"
            disabled={venueLocked}
          />
        </Field>
        <Field label="Required facilities" error={errors["venue.facilities"]}>
          <Input
            value={values.venue.facilities.join(", ")}
            onChange={(event) =>
              setVenue(
                "facilities",
                event.target.value
                  .split(",")
                  .map((facility) => facility.trimStart())
                  .filter(Boolean),
              )
            }
            placeholder="Projector, stage, pantry"
            aria-invalid={Boolean(errors["venue.facilities"])}
            disabled={venueLocked}
          />
          <p className="mt-1 text-xs text-slate-500">Separate facilities with commas.</p>
        </Field>
        <Field
          label="Accessibility needs"
          error={errors["venue.accessibilityNotes"]}
          className="sm:col-span-2"
        >
          <TextArea
            value={values.venue.accessibilityNotes}
            onChange={(event) => setVenue("accessibilityNotes", event.target.value)}
            placeholder="Wheelchair access, hearing loop, step-free route…"
            rows={3}
            disabled={venueLocked}
          />
        </Field>
      </FormSection>

      <FormSection
        number="04"
        title="Equipment and technical needs"
        description="Add only the equipment known at this stage. More items can be added later."
        action={
          <Button
            type="button"
            variant="outline"
            disabled={equipmentLocked}
            onClick={() =>
              setRoot("equipment", [
                ...values.equipment,
                { equipmentName: "", quantity: "1", notes: "" },
              ])
            }
          >
            <CirclePlus /> Add equipment
          </Button>
        }
      >
        {values.equipment.length === 0 ? (
          <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No equipment requirements added.
          </div>
        ) : (
          values.equipment.map((item, index) => (
            <div
              key={index}
              className="sm:col-span-2 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[1fr_9rem_1.5fr_auto]"
            >
              <Field label="Equipment" error={errors[`equipment.${index}.equipmentName`]}>
                <Input
                  value={item.equipmentName}
                  onChange={(event) =>
                    setEquipment(index, "equipmentName", event.target.value)
                  }
                  placeholder="Wireless microphone"
                  disabled={equipmentLocked}
                />
              </Field>
              <Field label="Quantity" error={errors[`equipment.${index}.quantity`]}>
                <Input
                  inputMode="numeric"
                  value={item.quantity}
                  onChange={(event) => setEquipment(index, "quantity", event.target.value)}
                  disabled={equipmentLocked}
                />
              </Field>
              <Field label="Technical notes" error={errors[`equipment.${index}.notes`]}>
                <Input
                  value={item.notes}
                  onChange={(event) => setEquipment(index, "notes", event.target.value)}
                  placeholder="Setup or compatibility details"
                  disabled={equipmentLocked}
                />
              </Field>
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove equipment item ${index + 1}`}
                  disabled={equipmentLocked}
                  onClick={() =>
                    setRoot(
                      "equipment",
                      values.equipment.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 />
                </Button>
              </div>
            </div>
          ))
        )}
      </FormSection>

      <FormSection
        number="05"
        title="Registration needs"
        description="Record early registration intentions. Submitting checks that every optional requirement is provided or marked not required."
      >
        <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 has-disabled:cursor-not-allowed has-disabled:opacity-50">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-blue-600"
            checked={values.registration.required}
            onChange={(event) => setRegistration("required", event.target.checked)}
            disabled={registrationLocked}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              Attendee registration is required
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Dates and capacity may still be left incomplete while this is a draft.
            </span>
          </span>
        </label>
        {values.registration.required && (
          <>
            <Field label="Registration opens" error={errors["registration.opensAt"]}>
              <Input
                type="datetime-local"
                value={values.registration.opensAt}
                onChange={(event) => setRegistration("opensAt", event.target.value)}
                disabled={registrationLocked}
              />
            </Field>
            <Field label="Registration closes" error={errors["registration.closesAt"]}>
              <Input
                type="datetime-local"
                value={values.registration.closesAt}
                onChange={(event) => setRegistration("closesAt", event.target.value)}
                aria-invalid={Boolean(errors["registration.closesAt"])}
                disabled={registrationLocked}
              />
            </Field>
            <Field label="Registration capacity" error={errors["registration.capacity"]}>
              <Input
                inputMode="numeric"
                value={values.registration.capacity}
                onChange={(event) => setRegistration("capacity", event.target.value)}
                placeholder="Leave blank if unknown"
                disabled={registrationLocked}
              />
            </Field>
            <label className="flex items-center gap-3 self-end pb-2 text-sm font-medium text-slate-800 has-disabled:cursor-not-allowed has-disabled:opacity-50">
              <input
                type="checkbox"
                className="size-4 accent-blue-600"
                checked={values.registration.waitlistEnabled}
                onChange={(event) =>
                  setRegistration("waitlistEnabled", event.target.checked)
                }
                disabled={registrationLocked}
              />
              Enable waiting list
            </label>
          </>
        )}
        <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-blue-600"
            checked={values.requirementsAcknowledged}
            onChange={(event) =>
              setRoot("requirementsAcknowledged", event.target.checked)
            }
            aria-invalid={Boolean(errors.requirementsAcknowledged)}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              Each optional requirement above is provided, or not required
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Required before this request can be submitted for review.
            </span>
            {errors.requirementsAcknowledged && (
              <span role="alert" className="mt-1.5 block text-sm text-red-700">
                {errors.requirementsAcknowledged}
              </span>
            )}
          </span>
        </label>
      </FormSection>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_32px_-24px_rgba(15,23,42,0.45)] backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <p aria-live="polite" className={cn("text-sm", message ? "text-red-700" : "text-slate-500")}>
            {message ?? "Only the event name is required to save this draft."}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={saving}>
              <Save /> {saving ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function FormSection({
  number,
  title,
  description,
  action,
  children,
}: {
  number: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_16px_45px_-38px_rgba(15,23,42,0.45)]">
      <div className="flex flex-col gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex gap-4">
          <span className="font-mono text-xs font-semibold tracking-wider text-blue-600">
            {number}
          </span>
          <div>
            <h2 className="font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 flex items-center gap-2 text-sm font-medium leading-none text-slate-900">
        <span>{label}</span>
        {required && <span className="text-xs font-semibold text-blue-600">Required</span>}
      </span>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </label>
  );
}

function TextArea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-24 w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-3 aria-invalid:border-red-600 aria-invalid:ring-red-200",
        className,
      )}
      {...props}
    />
  );
}
