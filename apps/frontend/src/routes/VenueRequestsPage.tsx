import { VENUE_BLOCK_REASON_CATEGORY_LABELS } from "@spm/shared";
import { ArrowRight, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { DisruptedPill } from "@/features/venues/components/disrupted-pill";
import { VenueBookingDecisionDialog } from "@/features/venues/components/venue-booking-decision-dialog";
import { VenueBookingHoldDialog } from "@/features/venues/components/venue-booking-hold-dialog";
import { VenueBookingStatusBadge } from "@/features/venues/components/venue-booking-status-badge";
import { VenueThumbnail } from "@/features/venues/components/venue-thumbnail";
import {
  decideVenueBookingRequest,
  listVenueBookingRequests,
  placeVenueBookingHold,
  type EventVenueRequirements,
  type VenueBookingDecision,
  type VenueBookingRequestSummary,
} from "@/features/venues/services/venue-bookings";
import {
  listVenueDisruptionsForCoordinator,
  type VenueDisruption,
} from "@/features/venues/services/venue-disruptions";
import {
  groupVenueRequests,
  venueRequestItemMatches,
  type VenueRequestItem,
} from "@/features/venues/utils/group-venue-requests";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});


export function VenueRequestsPage() {
  usePageTitle("Requests");
  const [requests, setRequests] = useState<VenueBookingRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");
  const [decisionTarget, setDecisionTarget] = useState<{
    request: VenueBookingRequestSummary;
    decision: VenueBookingDecision;
  }>();
  const [holdTarget, setHoldTarget] = useState<VenueBookingRequestSummary>();
  // Which requests to show: those waiting on Venue Staff (default), the decided ones, or both.
  const [view, setView] = useState<RequestsView>("needs");
  // Master-detail: which item the detail pane shows. On a narrow screen the
  // list and the detail take turns, so `detailOpen` says which one is showing.
  const [selectedKey, setSelectedKey] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  // SPM-83/82: open disruptions by booking, so a disrupted booking is flagged
  // wherever its status is shown. Non-critical: without it the page is as before.
  const [disruptions, setDisruptions] = useState<Map<string, VenueDisruption>>(new Map());

  useEffect(() => {
    let active = true;
    listVenueDisruptionsForCoordinator()
      .then((items) => {
        if (active) {
          setDisruptions(
            new Map(items.filter((item) => item.state !== "resolved").map((item) => [item.bookingId, item])),
          );
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    listVenueBookingRequests()
      .then((items) => {
        if (active) setRequests(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load venue booking requests.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleDecide(reason: string) {
    if (!decisionTarget) return;
    const { request, decision } = decisionTarget;
    await decideVenueBookingRequest(request.id, decision, reason);
    setDecisionTarget(undefined);
    setRequests((current) =>
      current.map((item) =>
        item.id === request.id
          ? {
              ...item,
              status: decision,
              decisionNotes: reason || null,
              decidedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
  }

  async function handlePlaceHold(expiresAtIso: string) {
    if (!holdTarget) return;
    await placeVenueBookingHold(holdTarget.id, expiresAtIso);
    setRequests((current) =>
      current.map((item) =>
        item.id === holdTarget.id ? { ...item, status: "on_hold", expiresAt: expiresAtIso } : item,
      ),
    );
    setHoldTarget(undefined);
  }

  // SPM-82: a replacement is grouped with the disrupted booking it replaces,
  // so one event reads as one story. Newest first, regardless of status.
  const searchedItems = groupVenueRequests(requests).filter((item) =>
    venueRequestItemMatches(item, searchQuery),
  );
  const needsCount = searchedItems.filter((item) => item.needsDecision).length;
  const items = searchedItems.filter(
    (item) => view === "all" || (view === "needs" ? item.needsDecision : !item.needsDecision),
  );
  // The first item is selected until another is chosen, and again if the
  // selected one leaves the list (a decision moves it to the other tab).
  const selectedItem = items.find((item) => item.key === selectedKey) ?? items[0];

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Venue workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Requests
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Venue booking requests submitted by event coordinators. Approve or reject each one. A replacement for a
              disrupted booking is shown next to the booking it replaces.
            </p>
          </header>

          <ListToolbar
            searchPlaceholder="Search by event or venue"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
          />

          {error && (
            <p
              role="alert"
              className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          {!loading && requests.length > 0 && (
            <div role="group" aria-label="Show requests" className="mt-6 flex flex-wrap gap-2">
              {(
                [
                  ["needs", `Needs decision (${needsCount})`],
                  ["decided", `Decided (${searchedItems.length - needsCount})`],
                  ["all", `All (${searchedItems.length})`],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={view === value}
                  onClick={() => setView(value)}
                  className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${
                    view === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-slate-200 bg-white text-slate-600 hover:border-primary/40"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <LoadingList />
          ) : requests.length === 0 ? (
            <EmptyState />
          ) : searchedItems.length === 0 ? (
            <NoSearchResults />
          ) : items.length === 0 ? (
            <section className="mt-7 grid min-h-40 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
              <p className="py-10 text-sm text-slate-500">
                {view === "needs"
                  ? "Nothing is waiting for a decision."
                  : "No decided requests yet."}
              </p>
            </section>
          ) : (
            <div className="mt-5 md:grid md:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] md:items-start md:gap-6">
              <ul
                aria-label="Requests"
                className={`space-y-2 ${detailOpen ? "hidden md:block" : ""}`}
              >
                {items.map((item) => (
                  <li key={item.key}>
                    <RequestRow
                      item={item}
                      disrupted={isItemDisrupted(item, disruptions)}
                      selected={item.key === selectedItem?.key}
                      onSelect={() => {
                        setSelectedKey(item.key);
                        setDetailOpen(true);
                      }}
                    />
                  </li>
                ))}
              </ul>
              {selectedItem && (
                <div className={detailOpen ? "" : "hidden md:block"}>
                  <button
                    type="button"
                    onClick={() => setDetailOpen(false)}
                    className="mb-3 text-sm font-medium text-primary hover:underline md:hidden"
                  >
                    ← All requests
                  </button>
                  <RequestItem
                    key={selectedItem.key}
                    item={selectedItem}
                    disruptions={disruptions}
                    onDecide={(request, decision) => setDecisionTarget({ request, decision })}
                    onPlaceHold={(request) => setHoldTarget(request)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {decisionTarget && (
        <VenueBookingDecisionDialog
          decision={decisionTarget.decision}
          onCancel={() => setDecisionTarget(undefined)}
          onSubmit={handleDecide}
        />
      )}
      {holdTarget && (
        <VenueBookingHoldDialog
          eventTitle={holdTarget.eventTitle}
          venueName={holdTarget.venueName}
          onCancel={() => setHoldTarget(undefined)}
          onSubmit={handlePlaceHold}
        />
      )}
    </RoleGate>
  );
}

type RequestsView = "needs" | "decided" | "all";

/** Whether an open venue block currently disrupts the booking this item is about. */
function isItemDisrupted(item: VenueRequestItem, disruptions: Map<string, VenueDisruption>) {
  return disruptions.has(item.kind === "single" ? item.request.id : item.original.id);
}

const shortDateFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeZone: "Asia/Singapore",
});

/** One compact row in the list: enough to choose an item, with the detail on the right. */
function RequestRow({
  item,
  disrupted,
  selected,
  onSelect,
}: {
  item: VenueRequestItem;
  disrupted: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const isReplacement = item.kind === "replacement";
  const shown = isReplacement ? item.current : item.request;
  const eventTitle = isReplacement ? item.original.eventTitle : item.request.eventTitle;
  const subtitle = isReplacement
    ? `${item.original.venueName} → ${item.current.venueName}`
    : item.request.venueName;

  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={`block w-full rounded-xl border p-4 text-left transition ${
        selected
          ? "border-primary bg-accent shadow-sm"
          : "border-slate-200 bg-white hover:border-primary/40"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-semibold text-slate-950">{eventTitle}</span>
        <span className="shrink-0 text-xs text-slate-500">
          {shortDateFormatter.format(new Date(shown.startsAt))}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-sm text-slate-600">{subtitle}</span>
      <span className="mt-2 flex flex-wrap items-center gap-1.5">
        {isReplacement && (
          <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-amber-800">
            Replacement
          </span>
        )}
        <VenueBookingStatusBadge status={shown.status} />
        {disrupted && <DisruptedPill />}
      </span>
    </button>
  );
}

function RequestItem({
  item,
  disruptions,
  onDecide,
  onPlaceHold,
}: {
  item: VenueRequestItem;
  disruptions: Map<string, VenueDisruption>;
  onDecide: (request: VenueBookingRequestSummary, decision: VenueBookingDecision) => void;
  onPlaceHold: (request: VenueBookingRequestSummary) => void;
}) {
  if (item.kind === "single") {
    return (
      <RequestCard
        request={item.request}
        disruption={disruptions.get(item.request.id)}
        onDecide={(decision) => onDecide(item.request, decision)}
        onPlaceHold={() => onPlaceHold(item.request)}
      />
    );
  }
  return (
    <ReplacementCard
      item={item}
      disruption={disruptions.get(item.original.id)}
      onDecide={onDecide}
      onPlaceHold={onPlaceHold}
    />
  );
}

function RequestCard({
  request,
  disruption,
  onDecide,
  onPlaceHold,
}: {
  request: VenueBookingRequestSummary;
  disruption?: VenueDisruption;
  onDecide: (decision: VenueBookingDecision) => void;
  onPlaceHold: () => void;
}) {
  return (
    <article className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6">
      <VenueThumbnail layouts={request.venueLayouts} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link
              to={`/events/${request.eventId}`}
              className="text-base font-semibold text-slate-950 hover:text-primary"
            >
              {request.eventTitle}
            </Link>
            <p className="mt-1 text-sm text-slate-600">{request.venueName}</p>
            {request.replacesBookingId && (
              <p className="mt-1 text-xs font-medium text-amber-800">
                Replacement for the disrupted booking
                {request.replacesVenueName ? ` at ${request.replacesVenueName}` : ""}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <VenueBookingStatusBadge status={request.status} />
            {disruption && <DisruptedPill />}
          </div>
        </div>
        {disruption && (
          <p className="mt-2 text-sm text-red-800">
            {VENUE_BLOCK_REASON_CATEGORY_LABELS[disruption.blockReasonCategory]}
            {disruption.blockReason ? ` – ${disruption.blockReason}` : ""}. The coordinator has been
            told to arrange an alternative.
          </p>
        )}

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-400">Requested period</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {dateTimeFormatter.format(new Date(request.startsAt))}
              {" – "}
              {dateTimeFormatter.format(new Date(request.endsAt))}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-400">Expected attendance</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {request.eventExpectedAttendance != null
                ? `${request.eventExpectedAttendance} attendees`
                : "Not provided"}
            </dd>
          </div>
          <VenueRequirementFields requirements={request.eventVenueRequirements} />
          <div>
            <dt className="text-xs font-medium text-slate-400">Requested by</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {request.requestedByName ?? "Unknown coordinator"} ·{" "}
              {dateTimeFormatter.format(new Date(request.requestedAt))}
            </dd>
          </div>
          {request.status === "on_hold" && request.expiresAt && (
            <div>
              <dt className="text-xs font-medium text-indigo-700">Hold expires</dt>
              <dd className="mt-1 text-sm font-semibold text-indigo-700">
                {dateTimeFormatter.format(new Date(request.expiresAt))}
              </dd>
            </div>
          )}
          {request.status !== "pending" && request.status !== "on_hold" && (
            <div>
              <dt className="text-xs font-medium text-slate-400">Decided by</dt>
              <dd className="mt-1 text-sm text-slate-800">
                {request.decidedByName ?? "—"}
                {request.decidedAt && ` · ${dateTimeFormatter.format(new Date(request.decidedAt))}`}
              </dd>
            </div>
          )}
          {request.decisionNotes && (
            <div className="sm:col-span-2">
              <dt className="text-xs font-medium text-slate-400">
                {request.status === "rejected" ? "Reason for rejection" : "Notes"}
              </dt>
              <dd className="mt-1 text-sm text-slate-800">{request.decisionNotes}</dd>
            </div>
          )}
        </dl>

        {request.status === "on_hold" && (
          <p className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
            Waiting on the coordinator to confirm. This request still blocks other bookings for
            this period.
          </p>
        )}
        {request.status === "expired" && (
          <p className="mt-4 text-sm text-slate-500">
            This request lapsed without confirmation. The venue is available again.
          </p>
        )}

        {request.status === "pending" && (
          <div className="mt-5 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onPlaceHold}>
              Place on hold
            </Button>
            <Button size="sm" variant="destructive" onClick={() => onDecide("rejected")}>
              Reject
            </Button>
            <Button size="sm" onClick={() => onDecide("approved")}>
              Approve
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * SPM-82: a replacement request shown next to the disrupted booking it
 * replaces, so Venue Staff decide with both in view: what exists now on the
 * left, what is proposed on the right, with the actions on the proposal.
 */
function ReplacementCard({
  item,
  disruption,
  onDecide,
  onPlaceHold,
}: {
  item: Extract<VenueRequestItem, { kind: "replacement" }>;
  disruption?: VenueDisruption;
  onDecide: (request: VenueBookingRequestSummary, decision: VenueBookingDecision) => void;
  onPlaceHold: (request: VenueBookingRequestSummary) => void;
}) {
  const { original, current, earlier } = item;
  const awaiting = current.status === "pending" || current.status === "on_hold";

  return (
    <article
      aria-label={`Replacement request for ${original.eventTitle}`}
      className="rounded-2xl border border-amber-200 bg-white p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to={`/events/${original.eventId}`}
            className="text-base font-semibold text-slate-950 hover:text-primary"
          >
            {original.eventTitle}
          </Link>
          <p className="mt-1 text-sm text-slate-600">
            {dateTimeFormatter.format(new Date(original.startsAt))}
            {" – "}
            {dateTimeFormatter.format(new Date(original.endsAt))}
            {original.eventExpectedAttendance != null &&
              ` · ${original.eventExpectedAttendance} attendees`}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Requested by {current.requestedByName ?? "Unknown coordinator"} ·{" "}
            {dateTimeFormatter.format(new Date(current.requestedAt))}
          </p>
        </div>
        <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-amber-800">
          Replacement request
        </span>
      </header>

      <div className="mt-5 grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <section
          aria-label="Disrupted booking"
          className="rounded-xl border border-red-100 bg-red-50/40 p-4"
        >
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            Disrupted booking
          </h3>
          <div className="mt-2 flex gap-3">
            <VenueThumbnail layouts={original.venueLayouts} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{original.venueName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <VenueBookingStatusBadge status={original.status} />
                {disruption && <DisruptedPill />}
              </div>
              {disruption && (
                <p className="mt-2 text-sm text-slate-600">
                  {VENUE_BLOCK_REASON_CATEGORY_LABELS[disruption.blockReasonCategory]}
                  {disruption.blockReason ? ` – ${disruption.blockReason}` : ""}
                </p>
              )}
            </div>
          </div>
        </section>

        <div className="hidden items-center text-slate-400 md:flex" aria-hidden="true">
          <ArrowRight className="size-5" />
        </div>

        <section
          aria-label={awaiting ? "Proposed replacement" : "Replacement"}
          className="rounded-xl border border-slate-200 p-4"
        >
          <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {awaiting ? "Proposed replacement" : "Replacement"}
          </h3>
          <div className="mt-2 flex gap-3">
            <VenueThumbnail layouts={current.venueLayouts} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{current.venueName}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <VenueBookingStatusBadge status={current.status} />
              </div>
              {current.status === "on_hold" && current.expiresAt && (
                <p className="mt-2 text-sm text-indigo-700">
                  On hold until {dateTimeFormatter.format(new Date(current.expiresAt))}. Waiting on the
                  coordinator to confirm.
                </p>
              )}
              {!awaiting && (
                <p className="mt-2 text-sm text-slate-600">
                  {current.decidedByName ?? "—"}
                  {current.decidedAt && ` · ${dateTimeFormatter.format(new Date(current.decidedAt))}`}
                </p>
              )}
              {current.decisionNotes && (
                <p className="mt-2 text-sm text-slate-700">
                  {current.status === "rejected" ? "Reason for rejection: " : "Notes: "}
                  {current.decisionNotes}
                </p>
              )}
            </div>
          </div>
          {current.advisoryNotes && (
            <p
              role="note"
              className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            >
              <span className="font-semibold">Check before deciding: </span>
              {current.advisoryNotes}
            </p>
          )}
          {current.status === "pending" && (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => onPlaceHold(current)}>
                Place on hold
              </Button>
              <Button size="sm" variant="destructive" onClick={() => onDecide(current, "rejected")}>
                Reject
              </Button>
              <Button size="sm" onClick={() => onDecide(current, "approved")}>
                Approve
              </Button>
            </div>
          )}
        </section>
      </div>

      {earlier.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-slate-600 select-none hover:text-slate-900">
            Earlier attempts ({earlier.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {earlier.map((attempt) => (
              <li key={attempt.id} className="flex flex-wrap items-center gap-2 text-slate-600">
                <span className="font-medium text-slate-800">{attempt.venueName}</span>
                <VenueBookingStatusBadge status={attempt.status} />
                {attempt.decisionNotes && <span>Reason: {attempt.decisionNotes}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </article>
  );
}

/**
 * SPM-24 AC05: what the event needs from the venue, so Venue Staff can judge
 * whether to commit it. A requirement the organiser left blank reads "Not
 * specified".
 */
function VenueRequirementFields({ requirements }: { requirements: EventVenueRequirements }) {
  const fields: Array<[string, string | null]> = [
    ["Preferred location", requirements.preferredLocation],
    [
      "Minimum capacity",
      requirements.minimumCapacity != null ? `${requirements.minimumCapacity} people` : null,
    ],
    ["Room layout", requirements.layoutNotes],
    [
      "Required facilities",
      requirements.facilities.length > 0 ? requirements.facilities.join(", ") : null,
    ],
    ["Accessibility needs", requirements.accessibilityNotes],
  ];

  return (
    <>
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs font-medium text-slate-400">{label}</dt>
          <dd className="mt-1 text-sm text-slate-800">{value ?? "Not specified"}</dd>
        </div>
      ))}
    </>
  );
}

function NoSearchResults() {
  return (
    <section className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <h2 className="text-lg font-semibold text-slate-950">No matching requests</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Try a different search term.</p>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mt-7 grid min-h-64 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <ClipboardList aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No venue booking requests</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Requests submitted by event coordinators will show up here.
        </p>
      </div>
    </section>
  );
}

function LoadingList() {
  return (
    <div aria-label="Loading requests" className="mt-7 space-y-4">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="h-40 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
