import type { SafetyReviewDetails } from "@spm/shared";

const NOT_RECORDED = "No information recorded";
const NOT_PROVIDED = "Not provided";

/**
 * One fact. A `required` one is something the brief says the review
 * considers; when it's missing it is highlighted, since the Safety Officer
 * may want to request changes for it.
 */
function Field({
  label,
  value,
  required = false,
}: {
  label: string;
  value: string | null | undefined;
  required?: boolean;
}) {
  const recorded = Boolean(value?.trim());
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{label}</dt>
      <dd
        className={
          recorded
            ? "mt-0.5 whitespace-pre-wrap text-sm text-slate-700"
            : required
              ? "mt-0.5 text-sm font-medium text-amber-700"
              : "mt-0.5 text-sm text-slate-700"
        }
      >
        {recorded ? value : required ? NOT_PROVIDED : NOT_RECORDED}
      </dd>
    </div>
  );
}

/** A Venue step check: whether the coordinator ticked it, and any details. */
function CheckField({ label, checked, details }: { label: string; checked: boolean; details: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{label}</dt>
      <dd className={checked ? "mt-0.5 text-sm font-medium text-emerald-700" : "mt-0.5 text-sm font-medium text-amber-700"}>
        {checked ? "Checked" : "Not checked"}
      </dd>
      {details?.trim() && <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-700">{details}</dd>}
    </div>
  );
}

/**
 * SPM-90: read-only facts for the Safety Officer, covering each factor the
 * brief lists — expected attendance against each booked venue's capacity
 * (shortfalls highlighted), layouts and accessibility, and the coordinator's
 * safety plan: emergency access, known restrictions, crowd movement and
 * equipment placement.
 */
export function SafetyReviewPanel({ details }: { details: SafetyReviewDetails }) {
  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          Attendance, venues and layouts
        </h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field
            label="Expected attendance"
            value={details.expectedAttendance === null ? null : String(details.expectedAttendance)}
          />
          <Field label="Layout preference" value={details.layoutPreference} />
          <Field label="Accessibility needs" value={details.accessibilityNeeds} />
        </dl>
        {details.venues.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No active venue booking for this event.</p>
        ) : (
          <ul className="mt-5 space-y-4">
            {details.venues.map((venue) => (
              <li key={venue.bookingId} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {venue.venueName}
                    <span className="ml-2 font-normal text-slate-500">{venue.location}</span>
                  </h3>
                  {venue.isMainVenue && (
                    <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                      Main
                    </span>
                  )}
                </div>
                <p
                  className={
                    venue.underCapacity
                      ? "mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800"
                      : "mt-2 text-sm text-slate-700"
                  }
                  role={venue.underCapacity ? "alert" : undefined}
                >
                  {venue.headcount === null
                    ? `Capacity ${venue.capacity}; no expected attendance recorded`
                    : `Expected ${venue.headcount} of capacity ${venue.capacity}`}
                  {venue.underCapacity && ` — exceeds capacity by ${(venue.headcount ?? 0) - venue.capacity}`}
                </p>
                <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Room layouts" value={venue.layouts.join(", ")} />
                  <Field label="Requested layout" value={venue.requestedLayoutNotes} />
                  <Field label="Venue accessibility" value={venue.venueAccessibilityNotes} />
                  <Field label="Requested accessibility" value={venue.requestedAccessibilityNotes} />
                  <Field label="Venue description" value={venue.venueDescription} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">Safety checks</h2>
        <p className="mt-1 text-sm text-slate-500">Checked by the event's coordinator on the Venue step.</p>
        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          <CheckField label="Emergency access" checked={details.emergencyAccessChecked} details={details.emergencyAccess} />
          <CheckField label="Known restrictions" checked={details.restrictionsChecked} details={details.restrictions} />
          <CheckField label="Crowd movement" checked={details.crowdMovementChecked} details={details.crowdMovementPlan} />
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          Equipment and placement
        </h2>
        {details.equipment.length > 0 && (
          <dl className="mt-4">
            <Field label="Equipment placement" value={details.equipmentPlacement} required />
          </dl>
        )}
        {details.equipment.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No equipment required for this event.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 pt-3">
            {details.equipment.map((item) => (
              <li key={item.requirementId} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-slate-800">
                  {item.equipmentName} × {item.quantity}
                </p>
                {item.notes?.trim() && (
                  <p className="mt-0.5 text-xs text-slate-500">Technical requirements: {item.notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
