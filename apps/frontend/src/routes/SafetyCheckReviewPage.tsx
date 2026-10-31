import type { EventReadiness, SafetyReviewDetails } from "@spm/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { EventPageTopBar } from "@/features/event-requests/components/event-page-top-bar";
import { loadEventDetail, type EventDetail } from "@/features/event-requests/services/event-details";
import { SafetyCheckDecisionDialog } from "@/features/safety-check/components/safety-check-decision-dialog";
import { SafetyReviewPanel } from "@/features/safety-check/components/safety-review-panel";
import { SafetyCheckItemPicker } from "@/features/safety-check/components/safety-check-item-picker";
import {
  loadEventReadiness,
  loadLatestSafetyCheckSubmission,
  loadSafetyReviewDetails,
  type SafetyCheckSubmission,
} from "@/features/safety-check/services/event-readiness";
import {
  decideEventSafetyCheck,
  type SafetyCheckDecisionOutcome,
} from "@/features/safety-check/services/safety-check-decisions";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * AC1/AC2/AC3: the Safety Officer's decision screen for one event. Reuses
 * the same event_readiness data the coordinator's pre-submission checklist
 * already shows. Review is read-only; item selection belongs only to the
 * Request changes dialog.
 */
export function SafetyCheckReviewPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventDetail>();
  const [readiness, setReadiness] = useState<EventReadiness>();
  const [reviewDetails, setReviewDetails] = useState<SafetyReviewDetails>();
  const [submission, setSubmission] = useState<SafetyCheckSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [showDialog, setShowDialog] = useState<SafetyCheckDecisionOutcome>();
  const [actionError, setActionError] = useState<string>();

  usePageTitle(event?.title ? `Safety Check Review — ${event.title}` : "Safety Check Review");

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setLoading(true);
    Promise.all([
      loadEventDetail(eventId),
      loadEventReadiness(eventId),
      loadLatestSafetyCheckSubmission(eventId).catch(() => null),
      loadSafetyReviewDetails(eventId),
    ])
      .then(([detail, eventReadiness, latestSubmission, details]) => {
        if (!active) return;
        setEvent(detail);
        setReadiness(eventReadiness);
        setSubmission(latestSubmission);
        setReviewDetails(details);
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
  }, [eventId]);

  function toggleBooking(bookingId: string) {
    setSelectedBookingIds((current) =>
      current.includes(bookingId) ? current.filter((id) => id !== bookingId) : [...current, bookingId],
    );
  }

  function toggleRequirement(requirementId: string) {
    setSelectedRequirementIds((current) =>
      current.includes(requirementId)
        ? current.filter((id) => id !== requirementId)
        : [...current, requirementId],
    );
  }

  const closeDecision = useCallback(() => setShowDialog(undefined), []);

  function openDecision(decision: SafetyCheckDecisionOutcome) {
    setSelectedBookingIds([]);
    setSelectedRequirementIds([]);
    setActionError(undefined);
    setShowDialog(decision);
  }

  async function handleDecide(decision: SafetyCheckDecisionOutcome, reason: string) {
    if (!eventId) return;
    await decideEventSafetyCheck(
      eventId,
      decision,
      reason,
      decision === "changes_requested" ? selectedBookingIds : [],
      decision === "changes_requested" ? selectedRequirementIds : [],
    );
    setShowDialog(undefined);
    navigate("/safety-checks", {
      replace: true,
      state: {
        decisionEventId: eventId,
        decisionRound: submission?.round,
        notice:
          decision === "approved"
            ? `"${event?.title}" approved — it's now Confirmed.`
            : decision === "changes_requested"
              ? `Changes requested for "${event?.title}".`
              : `"${event?.title}" rejected.`,
      },
    });
  }

  const flaggedCount = selectedBookingIds.length + selectedRequirementIds.length;

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <EventPageTopBar backTo="/safety-checks" backLabel="Back to safety checks" eventId={eventId} showHistory={false} />
            <Link to={`/safety-checks?tab=history&event=${eventId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Review history</Link>
          </div>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event || !readiness || !reviewDetails || !eventId ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6">
              <h1 className="text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                {event.title}
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                {event.startsAt && event.endsAt
                  ? `${dateTimeFormatter.format(new Date(event.startsAt))} – ${dateTimeFormatter.format(new Date(event.endsAt))}`
                  : "Schedule not set"}
                {event.expectedAttendance !== null && ` · ~${event.expectedAttendance} attendees`}
              </p>

              {submission && (
                <div className="mt-4 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-violet-900">
                      Round {submission.round} submission
                    </p>
                    <p className="text-xs text-violet-700">
                      Submitted {dateTimeFormatter.format(new Date(submission.submittedAt))}
                    </p>
                  </div>
                </div>
              )}

              <SafetyReviewPanel details={reviewDetails} />

              <SafetyCheckItemPicker readiness={readiness} readOnly />

              {actionError && (
                <p role="alert" className="mt-4 text-sm text-red-700">
                  {actionError}
                </p>
              )}

              <section aria-labelledby="review-decision-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
                <h2 id="review-decision-heading" className="text-lg font-semibold text-slate-950">Review decision</h2>
                <p className="mt-1 text-sm text-slate-600">Choose how this safety review should proceed.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-yellow-400 text-slate-950 hover:bg-yellow-500"
                    onClick={() => openDecision("changes_requested")}
                  >
                    Request changes
                  </Button>
                  <Button
                    type="button"
                    className="bg-red-600 text-white hover:bg-red-700"
                    onClick={() => openDecision("rejected")}
                  >
                    Reject safety arrangement
                  </Button>
                  <Button
                    type="button"
                    className="bg-emerald-600 text-white hover:bg-emerald-700 sm:ml-auto"
                    onClick={() => openDecision("approved")}
                  >
                    Approve
                  </Button>
                </div>
              </section>

              {showDialog && (
                <SafetyCheckDecisionDialog
                  decision={showDialog}
                  flaggedCount={flaggedCount}
                  onCancel={closeDecision}
                  onSubmit={async (reason) => {
                    setActionError(undefined);
                    try {
                      await handleDecide(showDialog, reason);
                    } catch (decideError) {
                      setActionError(
                        decideError instanceof Error
                          ? decideError.message
                          : "This decision could not be submitted.",
                      );
                      throw decideError;
                    }
                  }}
                >
                  {showDialog === "changes_requested" && (
                    <SafetyCheckItemPicker
                      readiness={readiness}
                      selectedBookingIds={selectedBookingIds}
                      onToggleBooking={toggleBooking}
                      selectedRequirementIds={selectedRequirementIds}
                      onToggleRequirement={toggleRequirement}
                    />
                  )}
                </SafetyCheckDecisionDialog>
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}
