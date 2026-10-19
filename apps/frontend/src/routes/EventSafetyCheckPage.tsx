import type { EventReadiness } from "@spm/shared";
import { useEffect, useState } from "react";
import { useParams } from "react-router";

import { useAuth } from "@/context/auth-context";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { EventPlanningTimeline } from "@/features/event-requests/components/event-planning-timeline";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import { OutstandingItemsList } from "@/features/safety-check/components/outstanding-items-list";
import { ReadinessChecklist } from "@/features/safety-check/components/readiness-checklist";
import { SubmitSafetyCheckButton } from "@/features/safety-check/components/submit-safety-check-button";
import {
  loadEventReadiness,
  loadLatestSafetyCheckSubmission,
  submitEventForSafetyCheck,
  type SafetyCheckSubmission,
} from "@/features/safety-check/services/event-readiness";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * The "Safety Check" sub-step of an event's Planning stage: the readiness
 * checklist (AC01/AC02/AC03/AC07) and the submit action (AC05/AC06), or — once
 * submitted — a read-only banner naming the round awaiting review.
 */
export function EventSafetyCheckPage() {
  const { eventId } = useParams();
  const { user } = useAuth();
  const [event, setEvent] = useState<EventDetail>();
  const [readiness, setReadiness] = useState<EventReadiness>();
  const [submission, setSubmission] = useState<SafetyCheckSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();

  usePageTitle(event?.title ? `Safety Check — ${event.title}` : "Safety Check");

  function loadAll(id: string) {
    let active = true;
    setLoading(true);
    Promise.all([
      loadEventDetail(id),
      loadEventReadiness(id),
      loadLatestSafetyCheckSubmission(id).catch(() => null),
    ])
      .then(([detail, eventReadiness, latestSubmission]) => {
        if (!active) return;
        setEvent(detail);
        setReadiness(eventReadiness);
        setSubmission(latestSubmission);
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
  }

  useEffect(() => {
    if (!eventId) return;
    return loadAll(eventId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function handleSubmit() {
    if (!eventId) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await submitEventForSafetyCheck(eventId);
      loadAll(eventId);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "This event could not be submitted for the safety check.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(event && user && event.assignedCoordinatorId === user.id && event.status === "planning");

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <EventPageTopBar backTo={`/events/${eventId}`} backLabel="Back to event" eventId={eventId} />

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event || !readiness || !eventId ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6 lg:flex lg:items-start lg:gap-10">
              <div className="mb-6 lg:mb-0 lg:sticky lg:top-24">
                <EventPlanningTimeline status={event.status} eventId={event.id} />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                  Safety Check
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Whether this event is ready for the Operational Safety Check, derived from its venue
                  and equipment records.
                </p>

                {event.status === "pending_safety_check" && (
                  <section
                    role="status"
                    className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-6 text-sm text-indigo-900"
                  >
                    {submission
                      ? `Submitted — round ${submission.round}, on ${dateTimeFormatter.format(new Date(submission.submittedAt))}. Awaiting Safety Officer review.`
                      : "Submitted and awaiting Safety Officer review."}
                  </section>
                )}

                <ReadinessChecklist readiness={readiness} />

                {!readiness.ready && <OutstandingItemsList items={readiness.outstandingItems} />}

                {submitError && (
                  <p role="alert" className="mt-4 text-sm text-red-700">
                    {submitError}
                  </p>
                )}

                <SubmitSafetyCheckButton
                  ready={readiness.ready}
                  canSubmit={canSubmit}
                  submitting={submitting}
                  onSubmit={handleSubmit}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}
