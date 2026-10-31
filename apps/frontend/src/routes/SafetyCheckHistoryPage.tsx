import { isSafetyCheckFlag, SAFETY_CHECK_FLAG_LABELS } from "@spm/shared";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link, useLocation, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { StatusBadge } from "@/features/event-requests/components/status-badges";
import {
  loadSafetyReviewHistoryRecord, SAFETY_REVIEW_OUTCOME_CLASSES, SAFETY_REVIEW_OUTCOME_LABELS,
  type SafetyReviewHistoryRecord,
} from "@/features/safety-check/services/safety-review-history";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateFormat = new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" });
function date(value: string | null) { return value ? dateFormat.format(new Date(value)) : "Not recorded"; }

/** A past round is always read-only, even if this event is awaiting a new review. */
export function SafetyCheckHistoryPage() {
  const { decisionId } = useParams();
  const { profile } = useAuth();
  const { state } = useLocation();
  const [record, setRecord] = useState<SafetyReviewHistoryRecord | null>();
  const [error, setError] = useState<string>();
  usePageTitle(record ? `${record.title} — Review round ${record.round}` : "Safety review record");
  useEffect(() => {
    if (profile?.role !== "safety_officer") return;
    let active = true;
    setRecord(undefined); setError(undefined);
    loadSafetyReviewHistoryRecord(Number(decisionId))
      .then((row) => { if (active) setRecord(row); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "This review record is unavailable."); });
    return () => { active = false; };
  }, [decisionId, profile?.role]);
  const savedSearch = (state as { historySearch?: unknown } | null)?.historySearch;
  const backParams = new URLSearchParams(typeof savedSearch === "string" ? savedSearch : "");
  backParams.set("tab", "history");
  return <RoleGate><div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10"><div className="mx-auto max-w-4xl">
    <Link to={`/safety-checks?${backParams}`} className={buttonVariants({ variant: "ghost", className: "-ml-2" })}><ArrowLeft /> Back to review history</Link>
    {error || record === null ? <p role="alert" className="mt-6 text-sm text-red-700">{error ?? "This review record could not be found."}</p> : !record ? <p role="status" className="mt-6 text-sm text-slate-500">Loading review record…</p> : <>
      <header className="mt-6 border-b border-slate-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">Read-only review record · Round {record.round}</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-950">{record.title}</h1>
        <div className="mt-4 flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${SAFETY_REVIEW_OUTCOME_CLASSES[record.outcome]}`}>{SAFETY_REVIEW_OUTCOME_LABELS[record.outcome]}</span><span className="text-sm text-slate-600">Reviewed by {record.reviewerName ?? "Unknown"} · {date(record.decidedAt)}</span></div>
      </header>
      <section aria-label="Current event status" className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Current event status</p><StatusBadge status={record.currentStatus} />
        {record.currentStatus === "pending_safety_check" && record.currentRound > record.round && <p className="mt-3 text-sm text-violet-800">Resubmitted for Round {record.currentRound}. This earlier decision is unchanged. <Link className="font-semibold underline" to={`/safety-checks/${record.eventId}`}>Review current submission</Link></p>}
      </section>
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">{record.outcome === "approved" ? "Approval note" : "Reason for decision"}</h2>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{record.reason || "No note recorded."}</p>
        {record.flaggedSafetyChecks.length > 0 && (
          <p className="mt-3 text-sm text-slate-700">
            <span className="font-medium">Safety checks flagged:</span>{" "}
            {record.flaggedSafetyChecks.map((check) => (isSafetyCheckFlag(check) ? SAFETY_CHECK_FLAG_LABELS[check] : check)).join(", ")}
          </p>
        )}
      </section>
      <section aria-label="Saved submission" className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-950">Submission reviewed · Round {record.round}</h2>
        <p className="mt-1 text-sm text-slate-500">These are the saved submission details, not the event’s current arrangements. Layout, accessibility and placement details were not included in this snapshot.</p>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Submitted</dt><dd>{date(record.submittedAt)}</dd></div><div><dt className="text-slate-500">Submitting coordinator</dt><dd>{record.coordinatorName ?? "Unknown"}</dd></div><div><dt className="text-slate-500">Submitted event period</dt><dd>{date(record.periodSnapshot.startsAt)} – {date(record.periodSnapshot.endsAt)}</dd></div><div><dt className="text-slate-500">Submitted expected attendance</dt><dd>{record.attendanceSnapshot ?? "Not recorded"}</dd></div></dl>
        <h3 className="mt-5 text-sm font-semibold text-slate-900">Venue arrangements</h3>
        {record.venuesSnapshot.length === 0 ? <p className="mt-2 text-sm text-slate-500">No venues recorded in the submission.</p> : <ul className="mt-2 space-y-2">{record.venuesSnapshot.map((venue) => <li key={venue.bookingId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{venue.venueName}{venue.isMainVenue ? " · Main venue" : ""}</span>{(record.outcome === "rejected" || record.flaggedBookingIds.includes(venue.bookingId)) && <span className="font-medium text-orange-800">Flagged for revision</span>}</li>)}</ul>}
        <h3 className="mt-5 text-sm font-semibold text-slate-900">Equipment arrangements</h3>
        {record.equipmentSnapshot.length === 0 ? <p className="mt-2 text-sm text-slate-500">No equipment recorded in the submission.</p> : <ul className="mt-2 space-y-2">{record.equipmentSnapshot.map((item) => <li key={item.requirementId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3 text-sm"><span>{item.equipmentName} × {item.quantity}</span>{(record.outcome === "rejected" || record.flaggedRequirementIds.includes(item.requirementId)) && <span className="font-medium text-orange-800">Flagged for revision</span>}</li>)}</ul>}
      </section>
    </>}
  </div></div></RoleGate>;
}
