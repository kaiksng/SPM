import type { SafetyReviewDetails } from "@spm/shared";

const NOT_RECORDED = "No information recorded";

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm text-slate-700">{value?.trim() ? value : NOT_RECORDED}</dd>
    </div>
  );
}

/**
 * SPM-90: read-only facts for the Safety Officer — expected attendance
 * against each booked venue's capacity (shortfalls highlighted), layouts,
 * accessibility, equipment and the venue's own notes. Venues have no
 * dedicated emergency-access or restrictions field, so the venue
 * description is shown under that heading.
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
                  <Field label="Emergency access and venue restrictions" value={venue.venueDescription} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold tracking-wide text-slate-400 uppercase">
          Equipment and placement
        </h2>
        {details.equipment.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No equipment required for this event.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {details.equipment.map((item) => (
              <li key={item.requirementId} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-slate-800">
                  {item.equipmentName} × {item.quantity}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Placement notes: {item.notes?.trim() ? item.notes : NOT_RECORDED}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
