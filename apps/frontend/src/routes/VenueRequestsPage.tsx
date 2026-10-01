import { Building2, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { VenueBookingDecisionDialog } from "@/features/venues/components/venue-booking-decision-dialog";
import { VenueBookingStatusBadge } from "@/features/venues/components/venue-booking-status-badge";
import {
  decideVenueBookingRequest,
  listVenueBookingRequests,
  type VenueBookingDecision,
  type VenueBookingRequestSummary,
} from "@/features/venues/services/venue-bookings";
import { getVenueLayoutImage } from "@/features/venues/utils/venue-layout-image";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

// Pending requests need Venue Staff's attention first; everything else
// follows by most-recently-requested, matching listVenueBookingRequests'
// own default order.
const STATUS_ORDER: Record<VenueBookingRequestSummary["status"], number> = {
  pending: 0,
  approved: 1,
  rejected: 2,
  cancelled: 3,
};

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

  const filteredRequests = filterRequests(requests, searchQuery).sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status],
  );

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Venue workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Requests
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Venue booking requests submitted by event coordinators. Approve or reject each one.
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

          {loading ? (
            <LoadingList />
          ) : requests.length === 0 ? (
            <EmptyState />
          ) : filteredRequests.length === 0 ? (
            <NoSearchResults />
          ) : (
            <ul className="mt-7 space-y-4">
              {filteredRequests.map((request) => (
                <li key={request.id}>
                  <RequestCard
                    request={request}
                    onDecide={(decision) => setDecisionTarget({ request, decision })}
                  />
                </li>
              ))}
            </ul>
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
    </RoleGate>
  );
}

function RequestCard({
  request,
  onDecide,
}: {
  request: VenueBookingRequestSummary;
  onDecide: (decision: VenueBookingDecision) => void;
}) {
  const layoutImage = getVenueLayoutImage(request.venueLayouts);

  return (
    <article className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-6">
      {layoutImage ? (
        <img
          src={layoutImage}
          alt=""
          aria-hidden="true"
          className="hidden size-24 shrink-0 rounded-xl object-cover sm:block"
        />
      ) : (
        <div className="hidden size-24 shrink-0 place-items-center rounded-xl bg-accent sm:grid">
          <Building2 className="size-6 text-primary" aria-hidden="true" />
        </div>
      )}
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
          </div>
          <VenueBookingStatusBadge status={request.status} />
        </div>

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
          <div>
            <dt className="text-xs font-medium text-slate-400">Requested by</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {request.requestedByName ?? "Unknown coordinator"} ·{" "}
              {dateTimeFormatter.format(new Date(request.requestedAt))}
            </dd>
          </div>
          {request.status !== "pending" && (
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

        {request.status === "pending" && (
          <div className="mt-5 flex justify-end gap-2">
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

/** Case-insensitive substring match on event title/venue name/requester. */
function filterRequests(requests: VenueBookingRequestSummary[], query: string) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return requests;
  return requests.filter(
    (request) =>
      request.eventTitle.toLowerCase().includes(trimmed) ||
      request.venueName.toLowerCase().includes(trimmed) ||
      (request.requestedByName ?? "").toLowerCase().includes(trimmed),
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
