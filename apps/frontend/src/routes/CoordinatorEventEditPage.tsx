import { getRoleDestination, type EventRequestFormValues } from "@spm/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { EventRequestForm } from "@/features/event-requests/components/event-request-form";
import {
  loadEventForCoordinatorEdit,
  updateEventAsCoordinator,
} from "@/features/event-requests/services/coordinator-event-edit";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/**
 * "Update Event Information During Planning": the coordinator's counterpart
 * to the organiser's draft editor. Reuses the same EventRequestForm — the
 * fields being edited are identical, only who may edit them (the assigned
 * coordinator, only while the event is Planning) and where the write lands
 * (update_event_as_coordinator, not save_event_draft) differ. Field-level
 * audit history (previous value, new value, actor, timestamp) is produced
 * for free by PB-07's existing triggers, which fire on any UPDATE regardless
 * of caller.
 */
export function CoordinatorEventEditPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [initialValues, setInitialValues] = useState<EventRequestFormValues>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  usePageTitle("Update event information");

  const authorised = profile?.role === "event_coordinator";

  useEffect(() => {
    if (!eventId || !authorised) return;
    let active = true;
    setLoading(true);
    loadEventForCoordinatorEdit(eventId)
      .then((values) => {
        if (active) setInitialValues(values);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This event is unavailable, not in Planning, or you do not have access to it.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, authorised]);

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

  async function handleSave(values: EventRequestFormValues) {
    if (!eventId) return;
    await updateEventAsCoordinator(eventId, values);
    navigate(`/events/${eventId}`, {
      replace: true,
      state: { notice: "Event information updated." },
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
              Update event information
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Changes are recorded with the previous value, new value, your name, and the time —
              visible in this event's change history.
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Overview, schedule, and registration details are locked once an event reaches
              Planning — only venue requirements and equipment can be adjusted here.
            </p>
          </header>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h2 className="font-semibold text-red-900">Event unavailable</h2>
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
          ) : initialValues ? (
            <div className="mt-7">
              <EventRequestForm
                initialValues={initialValues}
                onSave={handleSave}
                onCancel={() => navigate(`/events/${eventId}`)}
                submitLabel="Save changes"
                // Reuses EventRequestForm's clarification-lock mechanism: any
                // section not named here is disabled. Overview, schedule, and
                // registration are locked once Planning is reached (enforced
                // again, independently, by update_event_as_coordinator's own
                // checks) — only venue and equipment remain editable.
                permittedFields={["venue", "equipment"]}
              />
            </div>
          ) : null}
        </div>
      </div>
    </RoleGate>
  );
}
