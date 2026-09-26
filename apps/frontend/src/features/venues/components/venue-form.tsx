import {
  EventSubmissionError,
  venueFormSchema,
  type VenueBookingAtRisk,
  type VenueFormValues,
} from "@spm/shared";
import { AlertTriangle, Save } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperatingHoursEditor } from "@/features/venues/components/operating-hours-editor";
import { RoomLayoutsEditor } from "@/features/venues/components/room-layouts-editor";
import { cn } from "@/lib/utils";

type FieldErrors = Record<string, string>;

export function VenueForm({
  initialValues,
  atRiskBookings = [],
  onSave,
  onCancel,
  submitLabel = "Save venue",
}: {
  initialValues: VenueFormValues;
  /**
   * AC05/AC07: approved/pending bookings already on this venue, loaded once
   * up front so the capacity warning can be computed locally as the staff
   * member types, with no extra round trip per keystroke. Empty when
   * creating a new venue — nothing to compare a brand-new capacity against.
   */
  atRiskBookings?: VenueBookingAtRisk[];
  onSave: (values: VenueFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
}) {
  const [values, setValues] = useState(() => structuredClone(initialValues));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  // AC05/AC07: set once a save attempt finds the typed capacity below an
  // at-risk booking's expected attendance. Saving again while this is set
  // proceeds — the same "acknowledge, then confirm" shape the rest of this
  // app uses for a destructive/consequential action.
  const [capacityWarning, setCapacityWarning] = useState<VenueBookingAtRisk[]>();
  const [facilitiesText, setFacilitiesText] = useState(() =>
    initialValues.facilities.join(", "),
  );

  const setField = <Key extends keyof VenueFormValues>(
    key: Key,
    value: VenueFormValues[Key],
  ) => {
    setCapacityWarning(undefined);
    setValues((current) => ({ ...current, [key]: value }));
  };

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(undefined);

    const result = venueFormSchema.safeParse(values);
    if (!result.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        // operatingHours is a single editor, not one input per nested path
        // (e.g. "operatingHours.0.closesAt") — collapse any issue inside it
        // to the one Field it's rendered under.
        const key = issue.path[0] === "operatingHours" ? "operatingHours" : issue.path.join(".");
        if (!nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      setMessage("Check the highlighted fields and try again.");
      return;
    }

    // AC05/AC07. Only warn the first time — if the banner is already showing
    // for this capacity value, this same click is the confirmation to proceed.
    if (!capacityWarning) {
      const capacity = Number(result.data.capacity);
      const affected = atRiskBookings.filter(
        (booking) => booking.expectedAttendance > capacity,
      );
      if (affected.length > 0) {
        setErrors({});
        setCapacityWarning(affected);
        setMessage(
          "Review the warning below, then save again to confirm this capacity change.",
        );
        return;
      }
    }

    setErrors({});
    setSaving(true);
    try {
      await onSave(result.data);
    } catch (error) {
      if (error instanceof EventSubmissionError && error.fieldErrors) {
        setErrors(error.fieldErrors);
      }
      setMessage(
        error instanceof Error
          ? error.message
          : "This venue could not be saved. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6 pb-24">
      <FormSection
        number="01"
        title="Venue details"
        description="A unique name, location and capacity are required so coordinators can search and book this venue."
      >
        <Field label="Venue name" required error={errors.name}>
          <Input
            value={values.name}
            onChange={(event) => setField("name", event.target.value)}
            placeholder="e.g. Innovation Hall"
            maxLength={160}
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label="Location" required error={errors.location}>
          <Input
            value={values.location}
            onChange={(event) => setField("location", event.target.value)}
            placeholder="Building, campus area or address"
            aria-invalid={Boolean(errors.location)}
          />
        </Field>
        <Field label="Capacity" required error={errors.capacity}>
          <Input
            type="number"
            min="1"
            step="1"
            value={values.capacity}
            onChange={(event) => setField("capacity", event.target.value)}
            aria-invalid={Boolean(errors.capacity)}
          />
        </Field>
        <Field
          label="Supported room layouts"
          required
          error={errors.layouts}
          className="sm:col-span-2"
        >
          <RoomLayoutsEditor
            value={values.layouts}
            onChange={(next) => setField("layouts", next)}
            invalid={Boolean(errors.layouts)}
          />
        </Field>
        <Field
          label="Operating hours"
          required
          error={errors.operatingHours}
          className="sm:col-span-2"
        >
          <OperatingHoursEditor
            value={values.operatingHours}
            onChange={(next) => setField("operatingHours", next)}
          />
        </Field>
        <Field
          label="Facilities"
          required
          error={errors.facilities}
          className="sm:col-span-2"
        >
          <Input
            value={facilitiesText}
            onChange={(event) => {
              const text = event.target.value;
              setFacilitiesText(text);
              setField(
                "facilities",
                text
                  .split(",")
                  .map((facility) => facility.trim())
                  .filter(Boolean),
              );
            }}
            placeholder="Stage, projector, writable wall"
            aria-invalid={Boolean(errors.facilities)}
          />
          <p className="mt-1 text-xs text-slate-500">Separate facilities with commas.</p>
        </Field>
        <Field
          label="Description"
          error={errors.description}
          className="sm:col-span-2"
        >
          <TextArea
            value={values.description}
            onChange={(event) => setField("description", event.target.value)}
            placeholder="Notes coordinators should know before booking."
            rows={3}
          />
        </Field>
        <Field
          label="Accessibility notes"
          error={errors.accessibilityNotes}
          className="sm:col-span-2"
        >
          <TextArea
            value={values.accessibilityNotes}
            onChange={(event) => setField("accessibilityNotes", event.target.value)}
            placeholder="Describe accessibility features, or leave blank if none."
            rows={3}
          />
        </Field>
      </FormSection>

      {capacityWarning && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-medium">
              This capacity is below the expected attendance for{" "}
              {capacityWarning.length === 1
                ? "1 booking"
                : `${capacityWarning.length} bookings`}
              .
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-amber-800">
              {capacityWarning.map((booking) => (
                <li key={booking.id}>
                  "{booking.eventTitle}" — expects {booking.expectedAttendance}{" "}
                  attendees ({booking.status})
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-amber-800">
              Saving will mark {capacityWarning.length === 1 ? "this booking" : "these bookings"}{" "}
              as Needs Review and notify the assigned coordinator.
            </p>
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-12px_32px_-24px_rgba(15,23,42,0.45)] backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-5xl flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center sm:gap-4">
          <p aria-live="polite" className={cn("text-sm", message ? "text-red-700" : "text-slate-500")}>
            {message ?? "Name, location, capacity, facilities, operating hours and room layouts are all required."}
          </p>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" size="lg" disabled={saving}>
              <Save /> {saving ? "Saving…" : capacityWarning ? "Save anyway" : submitLabel}
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
  children,
}: {
  number: string;
  title: string;
  description: string;
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
  // A plain <div>, not <label> — this wraps custom multi-control editors
  // (OperatingHoursEditor's 7 day buttons + 2 time inputs) as well as single
  // inputs. A bare <label> with no `for` implicitly forwards activation
  // clicks to the FIRST labelable descendant, so wrapping several buttons in
  // one caused every click to also phantom-toggle whichever button came
  // first (a real bug, not a design choice).
  return (
    <div className={cn("block", className)}>
      <span className="mb-2 flex items-center gap-2 text-sm font-medium leading-none text-slate-900">
        <span>{label}</span>
        {required && (
          <span aria-hidden="true" className="text-xs font-semibold text-blue-600">
            Required
          </span>
        )}
      </span>
      {children}
      {error && (
        <p role="alert" className="mt-1.5 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
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
