import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/features/event-requests/components/status-badges";
import { listPendingSafetyCheckEvents, type PendingSafetyCheckEvent } from "@/features/safety-check/services/safety-check-decisions";
import {
  listSafetyReviewHistory, SAFETY_REVIEW_OUTCOME_CLASSES, SAFETY_REVIEW_OUTCOME_LABELS,
  type SafetyReviewHistoryRecord,
} from "@/features/safety-check/services/safety-review-history";
import { useAuth } from "@/context/auth-context";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore",
});
type LocationState = { notice?: string; decisionEventId?: string; decisionRound?: number } | null;

/** Action queue and durable review rounds, with independent loading/error states. */
export function SafetyChecksPage() {
  usePageTitle("Safety Checks");
  const { profile } = useAuth();
  const { state } = useLocation();
  const [params, setParams] = useSearchParams();
  const latestParams = useRef(params);
  useEffect(() => { latestParams.current = params; }, [params]);
  const historyTab = params.get("tab") === "history";
  const query = params.get("q") ?? "";
  const outcome = params.get("outcome") ?? "all";
  const eventFilter = params.get("event");
  const [events, setEvents] = useState<PendingSafetyCheckEvent[]>();
  const [history, setHistory] = useState<SafetyReviewHistoryRecord[]>();
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [historyError, setHistoryError] = useState<string>();

  useEffect(() => {
    if (profile?.role !== "safety_officer") return;
    let active = true;
    listPendingSafetyCheckEvents()
      .then((rows) => { if (active) setEvents(rows); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "The safety check queue is unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    listSafetyReviewHistory()
      .then((rows) => { if (active) setHistory(rows); })
      .catch((cause: unknown) => { if (active) setHistoryError(cause instanceof Error ? cause.message : "Safety review history is unavailable."); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [profile?.role]);

  function update(key: string, value: string) {
    const next = new URLSearchParams(latestParams.current);
    if (value) next.set(key, value); else next.delete(key);
    latestParams.current = next;
    setParams(next, { replace: true, state });
  }
  const needle = query.trim().toLocaleLowerCase();
  const visibleEvents = events?.filter((event) =>
    [event.title, event.organiserName, event.coordinatorName].some((value) => value?.toLocaleLowerCase().includes(needle)),
  );
  const visibleHistory = history?.filter((record) =>
    (!eventFilter || record.eventId === eventFilter) &&
    (outcome === "all" || record.outcome === outcome) &&
    [record.title, record.reviewerName, record.coordinatorName].some((value) => value?.toLocaleLowerCase().includes(needle)),
  );
  const notice = (state as LocationState)?.notice;
  const decisionEventId = (state as LocationState)?.decisionEventId;
  const lastDecision = decisionEventId ? history?.find((record) => record.eventId === decisionEventId && (!(state as LocationState)?.decisionRound || record.round === (state as LocationState)?.decisionRound)) : undefined;
  const activeError = historyTab ? historyError : error;
  const activeLoading = historyTab ? historyLoading : loading;

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">Safety Officer workspace</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">Safety Checks</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review events awaiting a decision and revisit the records of earlier review rounds.</p>
          </header>
          {notice && <div role="status" className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <p>{notice}</p>
            <p className="mt-1">The decision is saved in Review history. {lastDecision && <Link className="font-semibold underline" to={`/safety-checks/history/${lastDecision.decisionId}`}>View decision</Link>}</p>
          </div>}
          <div role="tablist" aria-label="Safety check workspace" onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const toHistory = event.key === "End" || (event.key !== "Home" && !historyTab);
            update("tab", toHistory ? "history" : "");
            document.getElementById(toHistory ? "review-history-tab" : "awaiting-review-tab")?.focus();
          }} className="mt-6 flex gap-2 border-b border-slate-200 pb-3">
            <button type="button" role="tab" aria-selected={!historyTab} aria-controls="safety-workspace-panel" id="awaiting-review-tab" tabIndex={historyTab ? -1 : 0} onClick={() => update("tab", "")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${!historyTab ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"}`}>Awaiting review{events ? ` · ${events.length}` : ""}</button>
            <button type="button" role="tab" aria-selected={historyTab} aria-controls="safety-workspace-panel" id="review-history-tab" tabIndex={historyTab ? 0 : -1} onClick={() => update("tab", "history")} className={`rounded-lg px-3 py-2 text-sm font-semibold ${historyTab ? "bg-primary text-white" : "text-slate-600 hover:bg-slate-100"}`}>Review history{history ? ` · ${history.length}` : ""}</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Input type="search" aria-label="Search safety checks" placeholder={historyTab ? "Search events, reviewers or coordinators" : "Search events, organisers or coordinators"} value={query} onChange={(e) => update("q", e.target.value)} className="min-w-0 flex-1" />
            {historyTab && <select aria-label="Filter review outcome" value={outcome} onChange={(e) => update("outcome", e.target.value)} className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm">
              <option value="all">All outcomes</option>
              {Object.entries(SAFETY_REVIEW_OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>}
          </div>
          <section role="tabpanel" id="safety-workspace-panel" aria-labelledby={historyTab ? "review-history-tab" : "awaiting-review-tab"} className="mt-5">
            {historyTab && eventFilter && <p className="mb-4 text-sm text-slate-600">Showing this event’s review rounds. <button type="button" onClick={() => update("event", "")} className="font-semibold text-primary underline">Show all review history</button></p>}
            <p className="mb-4 text-xs text-slate-500">{historyTab ? "Completed review rounds, newest decision first. Event status may have changed since a decision." : "Awaiting a decision, oldest submission first."}</p>
            {activeError ? <p role="alert" className="text-sm text-red-700">{activeError}</p> : activeLoading ? <p role="status" className="text-sm text-slate-500">Loading {historyTab ? "review history" : "safety checks"}…</p> : historyTab ? (
              !visibleHistory?.length ? <EmptyState title={history?.length ? "No matching reviews" : "No review history yet"} description={history?.length ? "Try another search or outcome filter." : "Decided review rounds will remain here after events leave the queue."} /> :
              <ul className="space-y-3">{visibleHistory.map((record) => <li key={record.decisionId}>
                <Link to={`/safety-checks/history/${record.decisionId}`} state={{ historySearch: params.toString() }} className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><h2 className="text-lg font-semibold text-slate-950">{record.title}</h2><p className="mt-1 text-sm text-slate-600">Round {record.round} · Reviewed by {record.reviewerName ?? "Unknown"}</p><p className="mt-1 text-xs text-slate-500">{dateTimeFormatter.format(new Date(record.decidedAt))}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${SAFETY_REVIEW_OUTCOME_CLASSES[record.outcome]}`}>{SAFETY_REVIEW_OUTCOME_LABELS[record.outcome]}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">Current event status: <StatusBadge status={record.currentStatus} /></div>
                  <span className="mt-3 inline-flex text-sm font-semibold text-primary">View decision →</span>
                </Link>
              </li>)}</ul>
            ) : !visibleEvents?.length ? <EmptyState title={events?.length ? "No matching events" : "Nothing to review"} description={events?.length ? "Try another search." : "No events are currently awaiting a safety check."} /> : (
              <ul className="space-y-3">{visibleEvents.map((event) => <li key={event.eventId}>
                <Link to={`/safety-checks/${event.eventId}`} className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><h2 className="text-lg font-semibold text-slate-950">{event.title}</h2>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500"><span>Organiser: {event.organiserName ?? "Unknown"}</span><span>Coordinator: {event.coordinatorName ?? "Unknown"}</span></div>
                      <p className="mt-2 text-xs text-slate-500">{event.startsAt ? dateTimeFormatter.format(new Date(event.startsAt)) : "Schedule not set"}{event.expectedAttendance !== null && ` · ~${event.expectedAttendance} attendees`}</p>
                      <p className="mt-1 text-xs text-slate-500">{event.submittedAt ? `Submitted ${dateTimeFormatter.format(new Date(event.submittedAt))}` : "Submission time not recorded"}</p>
                    </div>
                    {event.round !== null && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-700">{event.round > 1 ? "Resubmitted · " : ""}Round {event.round}</span>}
                  </div>
                  <span className="mt-3 inline-flex text-sm font-semibold text-primary">Review event →</span>
                </Link>
              </li>)}</ul>
            )}
          </section>
        </div>
      </div>
    </RoleGate>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center">
    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
    <p className="mt-2 text-sm text-slate-500">{description}</p>
  </div>;
}
