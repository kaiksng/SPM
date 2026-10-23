import {
  EventSubmissionError,
  EVENT_PURPOSE_OPTIONS,
  LOCATION_AREAS,
  emptyEquipmentRequirement,
  eventDraftSchema,
  isLegacyEquipmentRequirement,
  type EquipmentRequirementFormValues,
  type EventRequestFormValues,
  type RoomLayoutType,
} from "@spm/shared";
import { CirclePlus, Save, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import type { ZodType } from "zod";

import { Button } from "@/components/ui/button";
import { AmenityPicker } from "@/components/ui/amenity-picker";
import { Input } from "@/components/ui/input";
import { useEquipmentCatalogue } from "@/features/event-requests/hooks/use-equipment-catalogue";
import type { EquipmentCatalogueItem } from "@/features/event-requests/services/equipment";
import { useRoomLayoutOptions } from "@/features/venues/hooks/use-room-layout-options";
import { cn } from "@/lib/utils";

type FieldErrors = Record<string, string>;

export function EventRequestForm({
  initialValues,
  onSave,
  onSubmitRequest,
  onCancel,
  validationSchema = eventDraftSchema,
  submissionSchema,
  submitLabel = "Save draft",
  permittedFields,
}: {
  initialValues: EventRequestFormValues;
  onSave: (values: EventRequestFormValues) => Promise<void>;
  onSubmitRequest?: (values: EventRequestFormValues) => Promise<void>;
  onCancel: () => void;
  validationSchema?: ZodType<EventRequestFormValues>;
  submissionSchema?: ZodType<EventRequestFormValues>;
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
  const [pendingAction, setPendingAction] = useState<"save" | "submit">();
  const roomLayouts = useRoomLayoutOptions();
  const catalogue = useEquipmentCatalogue();

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
    key: keyof EquipmentRequirementFormValues,
    value: string,
  ) =>
    setValues((current) => ({
      ...current,
      equipment: current.equipment.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }));

  const replaceEquipment = (index: number, replacement: EquipmentRequirementFormValues) =>
    setValues((current) => ({
      ...current,
      equipment: current.equipment.map((item, itemIndex) =>
        itemIndex === index ? replacement : item,
      ),
    }));

  async function runAction(action: "save" | "submit") {
    setMessage(undefined);

    const schema = action === "submit" ? submissionSchema : validationSchema;
    const handler = action === "submit" ? onSubmitRequest : onSave;
    if (!schema || !handler) return;

    const result = schema.safeParse(values);
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
    setPendingAction(action);
    try {
      await handler(result.data);
    } catch (error) {
      // AC06: a server-side rejection (e.g. submission) highlights every
      // affected field the same way a local validation failure does.
      if (error instanceof EventSubmissionError && error.fieldErrors) {
        setErrors(error.fieldErrors);
      }
      setMessage(
        error instanceof Error
          ? error.message
          : action === "submit"
            ? "Your event request could not be submitted. Try again."
            : "Your draft could not be saved. Try again.",
      );
    } finally {
      setPendingAction(undefined);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction("save");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      <FormSection
        number="01"
        title="Event overview"
        description="Give the request a recognisable name. Everything else can be completed later."
      >
        <Field
          label="Event name"
          required="Required to save"
          error={errors.title}
          className="sm:col-span-2"
        >
          <Input
            name="title"
            value={values.title}
            onChange={(event) => setRoot("title", event.target.value)}
            placeholder="e.g. Student Leadership Summit"
            maxLength={160}
            aria-invalid={Boolean(errors.title)}
            disabled={isLocked("title")}
          />
        </Field>
        <Field
          label="Expected attendance"
          required="Required to submit"
          error={errors.expectedAttendance}
        >
          <Input
            type="number"
            name="expectedAttendance"
            min="1"
            step="1"
            value={values.expectedAttendance}
            onChange={(event) => setRoot("expectedAttendance", event.target.value)}
            placeholder="Leave blank if unknown"
            aria-invalid={Boolean(errors.expectedAttendance)}
            disabled={isLocked("expectedAttendance")}
          />
        </Field>
        <Field
          label="Purpose"
          required="Required to submit"
          error={errors.purpose}
          className="sm:col-span-2"
        >
          <select
            name="purpose"
            value={values.purpose}
            onChange={(event) => setRoot("purpose", event.target.value)}
            aria-invalid={Boolean(errors.purpose)}
            disabled={isLocked("purpose")}
            className="border-input h-9 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Select a purpose</option>
            {values.purpose && !EVENT_PURPOSE_OPTIONS.includes(values.purpose as typeof EVENT_PURPOSE_OPTIONS[number]) && (
              <option value={values.purpose}>{values.purpose} (previously saved)</option>
            )}
            {EVENT_PURPOSE_OPTIONS.map((purpose) => <option key={purpose} value={purpose}>{purpose}</option>)}
          </select>
        </Field>
        <Field
          label="Description"
          required="Required to submit"
          error={errors.description}
          className="sm:col-span-2"
        >
          <TextArea
            name="description"
            value={values.description}
            onChange={(event) => setRoot("description", event.target.value)}
            placeholder="Describe the format, audience and planning context."
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
        <Field label="Starts" required="Required to submit" error={errors.startsAt}>
          <Input
            type="datetime-local"
            name="startsAt"
            value={values.startsAt}
            onChange={(event) => setRoot("startsAt", event.target.value)}
            aria-invalid={Boolean(errors.startsAt)}
            disabled={isLocked("startsAt")}
          />
        </Field>
        <Field label="Ends" required="Required to submit" error={errors.endsAt}>
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
        description="Add a location, layout or accessibility requirement before submitting. Other details can be left blank."
      >
        <Field
          label="Preferred location"
          required="At least one venue detail is required"
          error={errors["venue.preferredLocation"]}
        >
          <select
            value={values.venue.preferredLocation}
            onChange={(event) => setVenue("preferredLocation", event.target.value)}
            aria-invalid={Boolean(errors["venue.preferredLocation"])}
            disabled={venueLocked}
            className="border-input h-9 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">No preference</option>
            {values.venue.preferredLocation && !LOCATION_AREAS.includes(values.venue.preferredLocation as typeof LOCATION_AREAS[number]) && (
              <option value={values.venue.preferredLocation}>{values.venue.preferredLocation} (previously saved)</option>
            )}
            {LOCATION_AREAS.map((area) => <option key={area} value={area}>{area}</option>)}
          </select>
        </Field>
        <Field label="Room layout" error={errors["venue.layoutNotes"]}>
          <select
            value={values.venue.layoutNotes}
            onChange={(event) =>
              setVenue("layoutNotes", event.target.value as RoomLayoutType | "")
            }
            disabled={venueLocked}
            aria-invalid={Boolean(errors["venue.layoutNotes"])}
            className={cn(
              "border-input flex h-8 w-full min-w-0 rounded-lg border bg-transparent px-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none",
              "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
              "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
              !values.venue.layoutNotes && "text-muted-foreground",
            )}
          >
            <option value="">No preference</option>
            {values.venue.layoutNotes && !roomLayouts.includes(values.venue.layoutNotes) && (
              <option value={values.venue.layoutNotes}>{values.venue.layoutNotes}</option>
            )}
            {roomLayouts.map((layout) => (
              <option key={layout} value={layout} className="text-foreground">
                {layout}
              </option>
            ))}
          </select>
        </Field>
        <AmenityPicker
          label="Required facilities"
          value={values.venue.facilities}
          onChange={(facilities) => setVenue("facilities", facilities)}
          disabled={venueLocked}
          error={errors["venue.facilities"]}
          className="sm:col-span-2"
        />
        <Field
          label="Accessibility needs"
          error={errors["venue.accessibilityNotes"]}
          className="sm:col-span-2"
        >
          <TextArea
            value={values.venue.accessibilityNotes}
            onChange={(event) => setVenue("accessibilityNotes", event.target.value)}
            placeholder="Describe any accessibility support, or leave blank if none."
            rows={3}
            disabled={venueLocked}
          />
        </Field>
      </FormSection>

      <FormSection
        number="04"
        title="Equipment requirements"
        description="Choose each item from the equipment catalogue. The required period should cover setup through cleanup. Leave this section empty if no equipment is needed."
        action={
          <Button
            type="button"
            variant="outline"
            disabled={equipmentLocked}
            onClick={() =>
              setRoot("equipment", [
                ...values.equipment,
                // Starts from the event's own schedule; widen it for setup
                // and cleanup as needed.
                emptyEquipmentRequirement({
                  requiredFrom: values.startsAt,
                  requiredUntil: values.endsAt,
                }),
              ])
            }
          >
            <CirclePlus /> Add equipment
          </Button>
        }
      >
        {catalogue.error && (
          <p role="alert" className="sm:col-span-2 text-sm text-red-700">
            {catalogue.error}
          </p>
        )}
        {values.equipment.length === 0 ? (
          <div className="sm:col-span-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No equipment requirements added.
          </div>
        ) : (
          values.equipment.map((item, index) => {
            const removeButton = (
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
            );

            // AC13: saved before the catalogue existed — keep it as it is,
            // or replace it by choosing a catalogue item.
            if (isLegacyEquipmentRequirement(item)) {
              return (
                <div
                  key={index}
                  className="sm:col-span-2 grid gap-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-[1fr_1fr_auto]"
                >
                  <div className="text-sm">
                    <p className="font-medium text-slate-900">
                      {item.legacyName} × {item.quantity}
                    </p>
                    <p className="mt-1 text-slate-600">
                      Previously saved — not in the equipment catalogue.
                      {item.notes ? ` Notes: ${item.notes}` : ""}
                    </p>
                  </div>
                  <Field label="Replace with catalogue equipment">
                    <EquipmentSelect
                      value=""
                      groups={catalogue.groups}
                      placeholder="Keep as it is"
                      disabled={equipmentLocked}
                      onChange={(equipmentItemId) =>
                        replaceEquipment(index, {
                          ...item,
                          equipmentItemId,
                          legacyName: "",
                          requiredFrom: values.startsAt,
                          requiredUntil: values.endsAt,
                        })
                      }
                    />
                  </Field>
                  <div className="flex items-end">{removeButton}</div>
                </div>
              );
            }

            return (
              <div
                key={index}
                className="sm:col-span-2 grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-[1.5fr_8rem_auto]"
              >
                <Field
                  label="Equipment"
                  required
                  error={errors[`equipment.${index}.equipmentItemId`]}
                >
                  <EquipmentSelect
                    value={item.equipmentItemId}
                    groups={catalogue.groups}
                    placeholder="Select equipment"
                    disabled={equipmentLocked}
                    invalid={Boolean(errors[`equipment.${index}.equipmentItemId`])}
                    onChange={(equipmentItemId) =>
                      setEquipment(index, "equipmentItemId", equipmentItemId)
                    }
                  />
                </Field>
                <Field label="Quantity" required error={errors[`equipment.${index}.quantity`]}>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(event) => setEquipment(index, "quantity", event.target.value)}
                    aria-invalid={Boolean(errors[`equipment.${index}.quantity`])}
                    disabled={equipmentLocked}
                  />
                </Field>
                <div className="flex items-end">{removeButton}</div>
                <div className="grid gap-4 sm:col-span-3 sm:grid-cols-2">
                  <Field
                    label="Required from"
                    required
                    error={errors[`equipment.${index}.requiredFrom`]}
                  >
                    <Input
                      type="datetime-local"
                      value={item.requiredFrom}
                      onChange={(event) =>
                        setEquipment(index, "requiredFrom", event.target.value)
                      }
                      aria-invalid={Boolean(errors[`equipment.${index}.requiredFrom`])}
                      disabled={equipmentLocked}
                    />
                  </Field>
                  <Field
                    label="Required until"
                    required
                    error={errors[`equipment.${index}.requiredUntil`]}
                  >
                    <Input
                      type="datetime-local"
                      value={item.requiredUntil}
                      onChange={(event) =>
                        setEquipment(index, "requiredUntil", event.target.value)
                      }
                      aria-invalid={Boolean(errors[`equipment.${index}.requiredUntil`])}
                      disabled={equipmentLocked}
                    />
                  </Field>
                  <Field
                    label="Technical requirements"
                    error={errors[`equipment.${index}.notes`]}
                    className="sm:col-span-2"
                  >
                    <Input
                      value={item.notes}
                      onChange={(event) => setEquipment(index, "notes", event.target.value)}
                      placeholder="e.g. XLR connection, HDMI input, power near the stage"
                      maxLength={1_000}
                      aria-invalid={Boolean(errors[`equipment.${index}.notes`])}
                      disabled={equipmentLocked}
                    />
                  </Field>
                </div>
              </div>
            );
          })
        )}
      </FormSection>

      <FormSection
        number="05"
        title="Registration needs"
        description="Only indicate whether attendees need to register. You set the registration rules once the event reaches Planning."
      >
        <label className="sm:col-span-2 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 has-disabled:cursor-not-allowed has-disabled:opacity-50">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={values.registration.required}
            onChange={(event) => setRegistration("required", event.target.checked)}
            disabled={registrationLocked}
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">
              Attendee registration is required
            </span>
            <span className="mt-1 block text-sm text-slate-500">
              Leave unchecked when attendees do not need to register.
            </span>
          </span>
        </label>
      </FormSection>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_32px_-24px_rgba(15,23,42,0.45)] backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p aria-live="polite" className={cn("text-sm", message ? "text-red-700" : "text-slate-500")}>
            {message ??
              (onSubmitRequest
                ? "Save with only an event name, or complete every required field to submit."
                : "Only the event name is required to save this draft.")}
          </p>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={Boolean(pendingAction)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="lg"
              variant={onSubmitRequest ? "outline" : "default"}
              disabled={Boolean(pendingAction)}
            >
              <Save /> {pendingAction === "save" ? "Saving…" : submitLabel}
            </Button>
            {onSubmitRequest && (
              <Button
                type="button"
                size="lg"
                disabled={Boolean(pendingAction)}
                onClick={() => void runAction("submit")}
              >
                <Send />
                {pendingAction === "submit" ? "Submitting…" : "Submit request"}
              </Button>
            )}
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
          <span className="font-mono text-xs font-semibold tracking-wider text-primary">
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
  required?: boolean | string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 flex items-center gap-2 text-sm font-medium leading-none text-slate-900">
        <span>{label}</span>
        {required && (
          <span aria-hidden="true" className="text-xs font-semibold text-primary">
            {typeof required === "string" ? required : "Required"}
          </span>
        )}
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

/** Catalogue items grouped by category (AC02) — no free-text entry. */
function EquipmentSelect({
  value,
  groups,
  placeholder,
  disabled,
  invalid,
  onChange,
}: {
  value: string;
  groups: Array<{ category: string; items: EquipmentCatalogueItem[] }>;
  placeholder: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (equipmentItemId: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      aria-invalid={invalid}
      className="border-input h-9 w-full rounded-lg border bg-white px-2.5 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-red-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="">{placeholder}</option>
      {groups.map((group) => {
        // A retired item is offered only to the row that already uses it.
        const options = group.items.filter((item) => !item.retired || item.id === value);
        return options.length === 0 ? null : (
          <optgroup key={group.category} label={group.category}>
            {options.map((item) => (
              <option key={item.id} value={item.id}>
                {item.retired ? `${item.name} (no longer offered)` : item.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </select>
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
