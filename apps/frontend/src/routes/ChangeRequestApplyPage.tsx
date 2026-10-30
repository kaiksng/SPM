import { getRoleDestination, type EventRequestFormValues, type EventStatus } from "@spm/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { EventRequestForm } from "@/features/event-requests/components/event-request-form";
import {
  applyEventChangeRequest,
  listEventChangeRequests,
  type EventChangeRequestSummary,
} from "@/features/event-requests/services/change-requests";
import { loadEventForChangeApply } from "@/features/event-requests/services/coordinator-event-edit";
import { describeRequestedChanges } from "@/features/event-requests/utils/format-change-request";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/** Mirrors apply_event_change_request's own status gate (202610230005). */
const APPLYABLE_EVENT_STATUSES: readonly EventStatus[] = [
  "requested",
  "planning",
  "confirmed",
  "pending_safety_check",
];

/**
 * SPM-40 AC07 / SPM-39 AC01: registration settings can't be changed from
 * Pending Safety Check onward, so on those events every other section stays
 * editable. The database refuses the change too (202610300005).
 */
const REGISTRATION_LOCKED_STATUSES: readonly EventStatus[] = ["pending_safety_check", "confirmed"];
const ALL_BUT_REGISTRATION = [
  "title",
  "expectedAttendance",
  "purpose",
  "description",
  "startsAt",
  "endsAt",
  "venue",
  "equipment",
];

/**
 * SPM-39 AC07: the assigned coordinator applies an approved change request.
 * Reuses EventRequestForm like CoordinatorEventEditPage, but with every
 * section editable — the approval is what unlocks the fields Planning
 * normally locks. apply_event_change_request then flags the affected
 * arrangements (AC01) and, for a safety-relevant change on a Confirmed or
 * Pending Safety Check event, returns it to Planning (AC10).
 */
export function ChangeRequestApplyPage() {
  const { eventId, changeRequestId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [initialValues, setInitialValues] = useState<EventRequestFormValues>();
  const [eventStatus, setEventStatus] = useState<EventStatus>();
  const [changeRequest, setChangeRequest] = useState<EventChangeRequestSummary>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  usePageTitle("Apply change request");

  const authorised = profile?.role === "event_coordinator";

  useEffect(() => {
    if (!eventId || !changeRequestId || !authorised) return;
    let active = true;
    setLoading(true);
    Promise.all([
      loadEventForChangeApply(eventId, APPLYABLE_EVENT_STATUSES),
      listEventChangeRequests(eventId),
    ])
      .then(([{ values, status }, requests]) => {
        if (!active) return;
        const request = requests.find((r) => r.id === changeRequestId);
        if (!request || request.status !== "approved") {
          setError("This change request is not waiting to be applied.");
          return;
        }
        setInitialValues(values);
        setEventStatus(status);
        setChangeRequest(request);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This event is unavailable or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, changeRequestId, authorised]);

  if (!authorised) {
    return (
      <RoleGate>
        <div className="grid min-h-[70vh] place-items-center bg-slate-50 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-red-700">Access denied</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              Event Coordinator access is required
            </h1>
            <Link
              to={profile ? getRoleDestination(profile.role) : "/login"}
              className={buttonVariants({ variant: "outline", className: "mt-6" })}
            >
              Return to your workspace
            </Link>
          </div>
        </div>
      </RoleGate>
    );
  }

  const registrationLocked = eventStatus !== undefined && REGISTRATION_LOCKED_STATUSES.includes(eventStatus);

  async function handleSave(values: EventRequestFormValues) {
    if (!eventId || !changeRequestId) return;
    const result = await applyEventChangeRequest(changeRequestId, values);
    navigate(`/events/${eventId}`, {
      replace: true,
      state: {
        notice: result.returnedToPlanning
          ? "Change applied. The event is back in Planning and needs a new safety review."
          : "Change applied. Any affected arrangements are marked Needs Review.",
      },
    });
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <EventPageTopBar
            backTo={eventId ? `/events/${eventId}` : "/events"}
            backLabel="Back to event"
            eventId={eventId}
          />
          <header className="mt-6 border-b border-slate-200 pb-7">
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Apply change request
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Enter the event's new details. Venue bookings and equipment affected by the change
              are marked Needs Review — nothing is cancelled or replaced automatically.
            </p>
          </header>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h2 className="font-semibold text-red-900">Change request unavailable</h2>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error}
              </p>
              <Link
                to={eventId ? `/events/${eventId}` : "/events"}
                className={buttonVariants({ variant: "outline", className: "mt-5" })}
              >
                Return to event
              </Link>
            </section>
          ) : initialValues && changeRequest ? (
            <>
              <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-6 text-sm">
                <h2 className="font-semibold text-slate-950">Approved change</h2>
                <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Requested change
                    </dt>
                    <dd className="mt-1 text-slate-700">
                      {describeRequestedChanges(changeRequest.requestedChanges)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Reason
                    </dt>
                    <dd className="mt-1 text-slate-700">{changeRequest.reason}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
                      Implementation notes
                    </dt>
                    <dd className="mt-1 text-slate-700">{changeRequest.reviewNotes}</dd>
                  </div>
                </dl>
              </section>
              {registrationLocked && (
                <p role="note" className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  Registration settings can't be changed once the event has been submitted for its
                  safety check.
                </p>
              )}
              <div className="mt-7">
                <EventRequestForm
                  initialValues={initialValues}
                  onSave={handleSave}
                  onCancel={() => navigate(`/events/${eventId}`)}
                  submitLabel="Apply change"
                  permittedFields={registrationLocked ? ALL_BUT_REGISTRATION : undefined}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </RoleGate>
  );
}
