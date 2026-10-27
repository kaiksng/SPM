import {
  clarificationPermittedFieldLabels,
  isDirectEditBlocked,
  isoToSingaporeLocal,
  type ClarificationPermittedField,
} from "@spm/shared";
import {
  CalendarDays,
  ChevronDown,
  FilePenLine,
  FilePlus2,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";

import { ActiveFilterChips } from "@/components/ui/active-filter-chips";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/context/auth-context";
import { AssignCoordinatorDialog } from "@/features/event-requests/components/assign-coordinator-dialog";
import { ClarificationPanel } from "@/features/event-requests/components/clarification-panel";
import {
  countActiveEventFilters,
  emptyEventFilters,
  eventFilterChips,
  EventFiltersPanel,
  type EventFilterValues,
} from "@/features/event-requests/components/event-filters";
import { EventHistoryButton } from "@/features/event-requests/components/event-history-link";
import { EventStatusBadge, StatusBadge } from "@/features/event-requests/components/status-badges";
import {
  assignEventCoordinator,
  listAllEvents,
  listCoordinators,
  type CoordinatorOption,
  type LeadEventSummary,
} from "@/features/event-requests/services/all-events";
import {
  listAssignedEvents,
  type AssignedEventSummary,
} from "@/features/event-requests/services/assigned-events";
import { getClarificationReviewState } from "@/features/event-requests/services/clarifications";
import { hasPendingChangeRequest } from "@/features/event-requests/services/change-requests";
import {
  cancelEventRequest,
  deleteEventDraft,
  listEventRequests,
  type EventDraftSummary,
} from "@/features/event-requests/services/event-drafts";
import { FROM_EVENTS_LIST_STATE } from "@/features/event-requests/utils/events-list-navigation";
import { CHANGE_REQUEST_SUBMITTABLE_STATUSES } from "@/features/event-requests/utils/format-change-request";
import {
  AffectedVenueBookings,
  splitVenueDisruptions,
  useVenueDisruptions,
} from "@/features/venues/components/affected-venue-bookings";
import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { ListToolbar } from "@/features/workspace/components/list-toolbar";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

type LocationState = { notice?: string } | null;

export function EventsPage() {
  usePageTitle("Events");
  const { profile } = useAuth();

  if (profile?.role === "event_organiser") return <OrganiserEventsView />;
  if (profile?.role === "event_coordinator") return <CoordinatorEventsView />;
  if (profile?.role === "event_coordinator_lead") return <LeadEventsView />;

  return (
    <RoleGate>
      <PagePlaceholder
        title="Events"
        description="Create, review, and track events here."
      />
    </RoleGate>
  );
}

function OrganiserEventsView() {
  const { user } = useAuth();
  const { state } = useLocation();
  const [events, setEvents] = useState<EventDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [draftToDelete, setDraftToDelete] = useState<EventDraftSummary>();
  const [requestToCancel, setRequestToCancel] = useState<EventDraftSummary>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<EventFilterValues>(() => eventFiltersFromParams(searchParams));

  // Kept in the URL so it's still there when the user goes back from a detail page.
  useEffect(() => {
    setSearchParams(eventParamsFromFilters(searchQuery, filters), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let active = true;
    listEventRequests(user.id)
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load your event requests.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  async function confirmDelete() {
    if (!draftToDelete) return;
    setError(undefined);
    try {
      await deleteEventDraft(draftToDelete.id);
      setEvents((current) =>
        current.filter((event) => event.id !== draftToDelete.id),
      );
      setDraftToDelete(undefined);
    } catch (deleteError) {
      setDraftToDelete(undefined);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "This draft could not be deleted.",
      );
    }
  }

  async function confirmCancel() {
    if (!requestToCancel) return;
    setError(undefined);
    try {
      await cancelEventRequest(requestToCancel.id);
      setEvents((current) =>
        current.filter((event) => event.id !== requestToCancel.id),
      );
      setRequestToCancel(undefined);
    } catch (cancelError) {
      setRequestToCancel(undefined);
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "This event request could not be cancelled.",
      );
    }
  }

  const notice = (state as LocationState)?.notice;
  const filteredEvents = filterEvents(events, searchQuery, filters);
  const statusOptions = [...new Set(events.map((event) => event.status))].sort();

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Organiser workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Event requests
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Prepare requests at your own pace. Drafts stay private and do not
              enter review until you submit them.
            </p>
          </header>

          <ListToolbar
            searchPlaceholder="Search events"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            filters={null}
            action={
              <Link to="/events/new" className={buttonVariants({ size: "sm" })}>
                <FilePlus2 /> New event
              </Link>
            }
          />
          <EventFiltersPanel value={filters} onChange={setFilters} statusOptions={statusOptions} />
          <ActiveFilterChips chips={eventFilterChips(filters, setFilters)} />

          {notice && (
            <p
              role="status"
              className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            >
              {notice}
            </p>
          )}
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
          ) : events.length === 0 ? (
            <EmptyState />
          ) : filteredEvents.length === 0 ? (
            <NoMatchingEvents
              filtersActive={countActiveEventFilters(filters) > 0}
              onClearFilters={() => setFilters(emptyEventFilters)}
            />
          ) : (
            <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredEvents.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onDelete={() => setDraftToDelete(event)}
                  onCancel={() => setRequestToCancel(event)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {draftToDelete && (
        <DeleteDraftDialog
          draft={draftToDelete}
          onCancel={() => setDraftToDelete(undefined)}
          onConfirm={confirmDelete}
        />
      )}

      {requestToCancel && (
        <CancelRequestDialog
          request={requestToCancel}
          onCancel={() => setRequestToCancel(undefined)}
          onConfirm={confirmCancel}
        />
      )}
    </RoleGate>
  );
}

function CoordinatorEventsView() {
  const { user } = useAuth();
  const { state } = useLocation();
  const [events, setEvents] = useState<AssignedEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get("q") ?? "");
  const [filters, setFilters] = useState<EventFilterValues>(() => eventFiltersFromParams(searchParams));
  const { disruptions, error: disruptionError } = useVenueDisruptions();

  // Kept in the URL so it's still there when the user goes back from a detail page.
  useEffect(() => {
    setSearchParams(eventParamsFromFilters(searchQuery, filters), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, filters]);
  // Events with a venue disruption that still needs attention get a badge.
  const eventsWithVenueIssue = new Set(
    splitVenueDisruptions(disruptions).open.map((item) => item.eventId),
  );

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    let active = true;
    listAssignedEvents(user.id)
      .then((items) => {
        if (active) setEvents(items);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load your assigned events.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [user]);

  const notice = (state as LocationState)?.notice;
  const filteredEvents = filterEvents(events, searchQuery, filters);
  const statusOptions = [...new Set(events.map((event) => event.status))].sort();

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
              Coordinator workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Assigned events
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Events assigned to you by the Event Coordinator Lead appear
              here.
            </p>
          </header>

          <ListToolbar
            searchPlaceholder="Search events"
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            filters={null}
          />
          <EventFiltersPanel value={filters} onChange={setFilters} statusOptions={statusOptions} />
          <ActiveFilterChips chips={eventFilterChips(filters, setFilters)} />

          {notice && (
            <p
              role="status"
              className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            >
              {notice}
            </p>
          )}
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
          ) : events.length === 0 ? (
            <CoordinatorEmptyState />
          ) : filteredEvents.length === 0 ? (
            <NoMatchingEvents
              filtersActive={countActiveEventFilters(filters) > 0}
              onClearFilters={() => setFilters(emptyEventFilters)}
            />
          ) : (
            <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredEvents.map((event) => (
                <AssignedEventCard
                  key={event.id}
                  event={event}
                  venueIssue={eventsWithVenueIssue.has(event.id)}
                />
              ))}
            </div>
          )}

          <AffectedVenueBookings disruptions={disruptions} error={disruptionError} />
        </div>
      </div>
    </RoleGate>
  );
}

/**
 * Event Coordinator Lead: every event, read-only. The Lead oversees
 * incoming requests and assignments but does not edit event requirements,
 * approve events, or submit venue/equipment requests — so unlike the
 * organiser's and coordinator's cards, these have no action buttons beyond
 * assign/reassign, history, and (now) opening the read-only detail page.
 */
type LeadTab = "queue" | "oversight";

const ACTIVE_EVENT_STATUSES = ["requested", "planning", "pending_safety_check", "confirmed"];

const STATUS_FILTER_LABELS: Record<string, string> = {
  active: "Active statuses",
  all: "All statuses",
  requested: "Requested",
  planning: "Planning",
  pending_safety_check: "Pending Safety Check",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

function LeadEventsView() {
  const { state } = useLocation();
  const [events, setEvents] = useState<LeadEventSummary[]>([]);
  const [coordinators, setCoordinators] = useState<CoordinatorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");
  const [tab, setTab] = useState<LeadTab>("queue");
  const [coordinatorFilter, setCoordinatorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [assigningEvent, setAssigningEvent] = useState<LeadEventSummary>();

  function reload() {
    setError(undefined);
    return listAllEvents()
      .then(setEvents)
      .catch((loadError: unknown) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We couldn't load events.",
        );
      });
  }

  // The Lead's data is otherwise fetched once on mount only (same
  // no-polling/no-realtime convention as every other page here, e.g.
  // NotificationBell) — this button is the Lead's way to see a change made
  // elsewhere (an organiser cancelling, another assignment) without a full
  // page reload.
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await reload();
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([listAllEvents(), listCoordinators()])
      .then(([eventItems, coordinatorItems]) => {
        if (!active) return;
        setEvents(eventItems);
        setCoordinators(coordinatorItems);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "We couldn't load events.",
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

  async function handleAssignSubmit(coordinatorId: string, reason: string) {
    if (!assigningEvent) return;
    await assignEventCoordinator(assigningEvent.id, coordinatorId, reason);
    setAssigningEvent(undefined);
    await reload();
  }

  const notice = (state as LocationState)?.notice;

  // AC: oldest submission first, no coordinator yet.
  const queueEvents = events
    .filter((event) => event.status === "requested" && !event.assignedCoordinatorId)
    .sort((a, b) => {
      const left = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const right = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return left - right;
    });

  // AC: oversight only covers assigned events; unassigned ones live in the queue.
  const assignedEvents = events.filter((event) => event.assignedCoordinatorId);
  const oversightEvents = assignedEvents.filter((event) => {
    if (coordinatorFilter !== "all" && event.assignedCoordinatorId !== coordinatorFilter) {
      return false;
    }
    if (statusFilter === "active") return ACTIVE_EVENT_STATUSES.includes(event.status);
    if (statusFilter === "all") return true;
    return event.status === statusFilter;
  });
  const oversightGroups = groupEventsByCoordinator(oversightEvents, coordinators, coordinatorFilter);

  const filteredQueueEvents = filterEventsByTitle(queueEvents, searchQuery);
  const filteredOversightGroups = oversightGroups
    .map((group) => ({
      hadEvents: group.events.length > 0,
      ...group,
      events: filterEventsByTitle(group.events, searchQuery),
    }))
    // A coordinator with no events under the current filter still appears
    // with a count of 0 (AC, SPM-80 TC-014); only drop a group the search
    // term matched nothing in.
    .filter((group) => group.events.length > 0 || !group.hadEvents);

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-7">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
                Event Coordinator Lead workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                All events
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Triage newly submitted events and oversee every coordinator's active work.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              <RefreshCw className={refreshing ? "animate-spin" : undefined} aria-hidden="true" />
              {refreshing ? "Refreshing…" : "Refresh"}
            </Button>
          </header>

          <div className="mt-6 flex gap-1 border-b border-slate-200">
            <LeadTabButton
              label={`Unassigned queue (${queueEvents.length})`}
              active={tab === "queue"}
              onClick={() => setTab("queue")}
            />
            <LeadTabButton
              label={`Oversight (${assignedEvents.length})`}
              active={tab === "oversight"}
              onClick={() => setTab("oversight")}
            />
          </div>

          {tab === "queue" ? (
            <EventsToolbar searchValue={searchQuery} onSearchChange={setSearchQuery} hideFilters />
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full max-w-xs">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
                />
                <Input
                  type="search"
                  placeholder="Search events"
                  aria-label="Search events"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="h-9 pl-8"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={coordinatorFilter}
                  onValueChange={(value) => setCoordinatorFilter(value ?? "all")}
                  items={{
                    all: "All coordinators",
                    ...Object.fromEntries(
                      coordinators.map((coordinator) => [
                        coordinator.id,
                        coordinator.fullName ?? "Unnamed coordinator",
                      ]),
                    ),
                  }}
                >
                  <SelectTrigger aria-label="Filter by coordinator" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All coordinators</SelectItem>
                    {coordinators.map((coordinator) => (
                      <SelectItem key={coordinator.id} value={coordinator.id}>
                        {coordinator.fullName ?? "Unnamed coordinator"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => setStatusFilter(value ?? "active")}
                  items={STATUS_FILTER_LABELS}
                >
                  <SelectTrigger aria-label="Filter by status" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS_FILTER_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {notice && (
            <p
              role="status"
              className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"
            >
              {notice}
            </p>
          )}
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
          ) : tab === "queue" ? (
            queueEvents.length === 0 ? (
              <LeadEmptyState tab="queue" />
            ) : filteredQueueEvents.length === 0 ? (
              <NoMatchingEvents />
            ) : (
              <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredQueueEvents.map((event) => (
                  <LeadEventCard
                    key={event.id}
                    event={event}
                    onAssign={() => setAssigningEvent(event)}
                  />
                ))}
              </div>
            )
          ) : oversightEvents.length === 0 ? (
            <LeadEmptyState tab="oversight" />
          ) : filteredOversightGroups.length === 0 ? (
            <NoMatchingEvents />
          ) : (
            <div className="mt-7 space-y-8">
              {filteredOversightGroups.map((group) => (
                <section key={group.coordinatorId}>
                  <h2 className="flex items-baseline gap-2 text-sm font-semibold text-slate-700">
                    {group.coordinatorName}
                    <span className="text-xs font-normal text-slate-400">
                      {group.events.length} event{group.events.length === 1 ? "" : "s"}
                    </span>
                  </h2>
                  <div className="mt-3 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {group.events.map((event) => (
                      <LeadEventCard
                        key={event.id}
                        event={event}
                        onAssign={() => setAssigningEvent(event)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      {assigningEvent && (
        <AssignCoordinatorDialog
          mode={assigningEvent.assignedCoordinatorId ? "reassign" : "assign"}
          coordinators={coordinators}
          currentCoordinatorId={assigningEvent.assignedCoordinatorId}
          onCancel={() => setAssigningEvent(undefined)}
          onSubmit={handleAssignSubmit}
        />
      )}
    </RoleGate>
  );
}

/**
 * Groups assigned events by coordinator, alphabetised by coordinator name.
 * A coordinator with no events under the current filter still appears, with
 * a count of 0 (AC, SPM-80 TC-014), rather than being omitted.
 */
function groupEventsByCoordinator(
  events: LeadEventSummary[],
  coordinators: CoordinatorOption[],
  coordinatorFilter: string,
) {
  const groups = new Map<string, { coordinatorId: string; coordinatorName: string; events: LeadEventSummary[] }>();
  for (const coordinator of coordinators) {
    if (coordinatorFilter !== "all" && coordinator.id !== coordinatorFilter) continue;
    groups.set(coordinator.id, {
      coordinatorId: coordinator.id,
      coordinatorName: coordinator.fullName ?? "Unnamed coordinator",
      events: [],
    });
  }
  for (const event of events) {
    const coordinatorId = event.assignedCoordinatorId;
    if (!coordinatorId) continue;
    const existing = groups.get(coordinatorId);
    if (existing) {
      existing.events.push(event);
    } else {
      groups.set(coordinatorId, {
        coordinatorId,
        coordinatorName: event.assignedCoordinatorName ?? "Unnamed coordinator",
        events: [event],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    a.coordinatorName.localeCompare(b.coordinatorName),
  );
}

function LeadTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

/** Case-insensitive substring match on title — used by LeadEventsView, which has its own ad hoc filters. */
function filterEventsByTitle<T extends { title: string }>(
  events: T[],
  query: string,
): T[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return events;
  return events.filter((event) => event.title.toLowerCase().includes(trimmed));
}

/** An event must match the search term and every active filter category — used by the organiser and coordinator views. */
function filterEvents<T extends { title: string; status: string; startsAt: string | null }>(
  events: T[],
  query: string,
  filters: EventFilterValues,
): T[] {
  const trimmed = query.trim().toLowerCase();
  return events.filter((event) => {
    const matchesSearch = !trimmed || event.title.toLowerCase().includes(trimmed);
    const matchesStatus = !filters.status || event.status === filters.status;
    const eventDate = event.startsAt ? isoToSingaporeLocal(event.startsAt).slice(0, 10) : null;
    const matchesFrom = !filters.dateFrom || (eventDate !== null && eventDate >= filters.dateFrom);
    const matchesTo = !filters.dateTo || (eventDate !== null && eventDate <= filters.dateTo);
    return matchesSearch && matchesStatus && matchesFrom && matchesTo;
  });
}

function eventFiltersFromParams(params: URLSearchParams): EventFilterValues {
  return {
    status: params.get("status") ?? "",
    dateFrom: params.get("dateFrom") ?? "",
    dateTo: params.get("dateTo") ?? "",
  };
}

function eventParamsFromFilters(query: string, filters: EventFilterValues): URLSearchParams {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filters.status) params.set("status", filters.status);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  return params;
}

function NoMatchingEvents({
  filtersActive,
  onClearFilters,
}: {
  filtersActive?: boolean;
  onClearFilters?: () => void;
}) {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <Search aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No matching events</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Try a different search term{filtersActive ? " or adjust your filters" : ""}.
        </p>
        {filtersActive && onClearFilters && (
          <Button type="button" variant="outline" className="mt-5" onClick={onClearFilters}>
            Clear filters
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * Search filters the events already loaded, by title, client-side only — no
 * new backend query. Filters is still a placeholder: it isn't wired to
 * anything until the product decides what it should filter by.
 */
function EventsToolbar({
  createHref,
  searchValue,
  onSearchChange,
  hideFilters,
}: {
  createHref?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  /** The Lead's Oversight tab renders its own (functional) coordinator/status
   * filters in place of this placeholder — see LeadEventsView. */
  hideFilters?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-slate-400"
          />
          <Input
            type="search"
            placeholder="Search events"
            aria-label="Search events"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-9 pl-8"
          />
        </div>
        {!hideFilters && (
          <Button type="button" variant="outline" size="sm">
            Filters <ChevronDown className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
      {createHref && (
        <Link to={createHref} className={buttonVariants({ size: "sm" })}>
          <FilePlus2 /> New event
        </Link>
      )}
    </div>
  );
}

/**
 * SPM-38: a pending change request doesn't change the event's own status, so
 * without this an organiser/coordinator/Lead would have no visible sign one
 * is awaiting review. Deliberately not shaped like a status pill (square
 * corners, dashed border, an icon, a colour no status uses) — it sits next
 * to the status badge and was easy to mistake for a second status when it
 * looked the same (rounded-full, solid border, no icon).
 */
function ChangeRequestBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-orange-300 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800">
      <FilePenLine className="size-3.5" aria-hidden="true" />
      Change requested
    </span>
  );
}

function useHasPendingChangeRequest(eventId: string, eventStatus: string) {
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    if (!CHANGE_REQUEST_SUBMITTABLE_STATUSES.has(eventStatus)) return;
    let active = true;
    hasPendingChangeRequest(eventId).then((result) => {
      if (active) setHasPending(result);
    });
    return () => {
      active = false;
    };
  }, [eventId, eventStatus]);

  return hasPending;
}

function EventCard({
  event,
  onDelete,
  onCancel,
}: {
  event: EventDraftSummary;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const isDraft = event.status === "draft";
  // PB-03 AC07: a requested event may still be edited by its organiser
  // before it is approved.
  const isRequested = event.status === "requested";
  const [reviewState, setReviewState] = useState<"open" | "answered">();
  const hasPendingChange = useHasPendingChangeRequest(event.id, event.status);
  return (
    <article className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_22px_50px_-34px_rgba(37,99,235,0.35)] motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <EventStatusBadge
            status={event.status}
            reviewState={reviewState === "open" ? "open" : undefined}
            role="organiser"
          />
          {hasPendingChange && <ChangeRequestBadge />}
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          Updated {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(event.updatedAt))}
        </span>
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-950">
        {event.title}
      </h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
        {event.purpose || "Purpose not added yet"}
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <CalendarDays className="size-4" aria-hidden="true" />
        {event.startsAt
          ? new Intl.DateTimeFormat("en-SG", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Singapore",
            }).format(new Date(event.startsAt))
          : "Schedule not added"}
      </div>
      {/* PB-03 AC04: the organiser can see when a request was submitted. */}
      {event.submittedAt && (
        <p className="mt-1 text-xs text-slate-400">
          Submitted{" "}
          {new Intl.DateTimeFormat("en-SG", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Singapore",
          }).format(new Date(event.submittedAt))}
        </p>
      )}
      {/* PB-04 AC02: the organiser can see who is coordinating their request. */}
      {event.assignedCoordinatorName ? (
        <p className="mt-1 text-xs text-slate-500">
          Coordinator: {event.assignedCoordinatorName}
        </p>
      ) : (
        event.status === "requested" && (
          <p className="mt-1 text-xs text-slate-500">
            Awaiting coordinator assignment
          </p>
        )
      )}
      <div className="mt-auto flex flex-col gap-2">
        {/* Later cards reach the history through View details (the event
            page's Change history), like the coordinator's card; Draft and
            Requested cards have no View details, so they keep it here. */}
        {(isDraft || isRequested) && <EventHistoryButton eventId={event.id} />}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {isDraft ? (
            <>
              <Link
                to={`/events/${event.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil /> Continue editing
              </Link>
              <Link
                to={`/events/${event.id}/submit`}
                className={buttonVariants({ variant: "default" })}
              >
                <Send /> Submit request
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Delete ${event.title}`}
                onClick={onDelete}
                className="ml-auto text-red-700 hover:bg-red-50 hover:text-red-800"
              >
                <Trash2 />
              </Button>
            </>
          ) : isRequested ? (
            <>
              <Link
                to={`/events/${event.id}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil /> Edit request
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Cancel ${event.title}`}
                title={
                  reviewState !== undefined
                    ? "Resolve the open clarification before cancelling"
                    : undefined
                }
                disabled={reviewState !== undefined}
                onClick={onCancel}
                className="ml-auto text-red-700 hover:bg-red-50 hover:text-red-800 disabled:pointer-events-none disabled:opacity-40"
              >
                <Trash2 />
              </Button>
            </>
          ) : (
            <>
              <EventCardLinks event={event} />
              <span className="self-center text-sm text-slate-500">
                {isDirectEditBlocked(event.status)
                  ? "This event is finalised. Direct edits are locked — submit a change request instead."
                  : "Editing is unavailable in this workflow."}
              </span>
            </>
          )}
        </div>
      </div>
      <ClarificationPanel
        eventId={event.id}
        eventStatus={event.status}
        role="organiser"
        onReviewStateChange={setReviewState}
      />
    </article>
  );
}

function AssignedEventCard({
  event,
  venueIssue = false,
}: {
  event: AssignedEventSummary;
  venueIssue?: boolean;
}) {
  const [reviewState, setReviewState] = useState<{
    status: "open" | "answered";
    permittedFields: string[];
  }>();
  const hasPendingChange = useHasPendingChangeRequest(event.id, event.status);

  useEffect(() => {
    if (event.status !== "requested") return;
    let active = true;
    getClarificationReviewState(event.id).then((result) => {
      if (active) setReviewState(result);
    });
    return () => {
      active = false;
    };
  }, [event.id, event.status]);

  return (
    <article className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <EventStatusBadge
            status={event.status}
            reviewState={reviewState?.status === "open" ? "open" : undefined}
            role="coordinator"
          />
          {hasPendingChange && <ChangeRequestBadge />}
          {venueIssue && (
            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">
              Venue issue
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          Updated {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(event.updatedAt))}
        </span>
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-950">
        {event.title}
      </h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
        {event.purpose || "Purpose not added yet"}
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <CalendarDays className="size-4" aria-hidden="true" />
        {event.startsAt
          ? new Intl.DateTimeFormat("en-SG", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Singapore",
            }).format(new Date(event.startsAt))
          : "Schedule not added"}
      </div>
      {event.submittedAt && (
        <p className="mt-1 text-xs text-slate-400">
          Submitted{" "}
          {new Intl.DateTimeFormat("en-SG", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Singapore",
          }).format(new Date(event.submittedAt))}
        </p>
      )}
      {event.organiserName && (
        <p className="mt-1 text-xs text-slate-500">
          Organiser: {event.organiserName}
        </p>
      )}
      {reviewState?.status === "answered" && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-red-600">Edited:</span>
          {reviewState.permittedFields.map((field) => (
            <span
              key={field}
              className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
            >
              {clarificationPermittedFieldLabels[field as ClarificationPermittedField] ?? field}
            </span>
          ))}
        </div>
      )}
      {/* View Event Registration Information: a second action needs its own
          link, so this card can no longer be one giant Link wrapping
          everything — "View details" moved to its own footer button. */}
      <div className="mt-auto pt-4">
        <EventCardLinks event={event} />
      </div>
    </article>
  );
}

/**
 * The footer links shared by the organiser's and coordinator's event cards:
 * View details and, once registration could exist at all (Confirmed or
 * Completed), View registrations — the same width, both clearly buttons.
 */
function EventCardLinks({ event }: { event: { id: string; status: string } }) {
  return (
    <div className="flex w-full gap-2">
      <Link
        to={`/events/${event.id}`}
        state={FROM_EVENTS_LIST_STATE}
        className={buttonVariants({ size: "lg", className: "flex-1 basis-0 justify-center" })}
      >
        View details
      </Link>
      {(event.status === "confirmed" || event.status === "completed") && (
        <Link
          to={`/events/${event.id}/registrations`}
          className={buttonVariants({
            variant: "outline",
            size: "lg",
            className:
              "flex-1 basis-0 justify-center border-primary/30 bg-accent text-primary hover:bg-accent/80",
          })}
        >
          View registrations
        </Link>
      )}
    </div>
  );
}

function LeadEventCard({
  event,
  onAssign,
}: {
  event: LeadEventSummary;
  onAssign: () => void;
}) {
  const isAssigned = Boolean(event.assignedCoordinatorId);
  // Mirrors reassign_event_coordinator's own block list — showing a button
  // that the database would always refuse is worse than not showing one.
  const isReassignmentBlocked = ["draft", "rejected", "cancelled", "completed"].includes(
    event.status,
  );
  const hasPendingChange = useHasPendingChangeRequest(event.id, event.status);
  return (
    <article className="flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={event.status} />
          {hasPendingChange && <ChangeRequestBadge />}
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          Updated {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium", timeZone: "Asia/Singapore" }).format(new Date(event.updatedAt))}
        </span>
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-950">
        {event.title}
      </h2>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
        {event.purpose || "Purpose not added yet"}
      </p>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
        <CalendarDays className="size-4" aria-hidden="true" />
        {event.startsAt
          ? new Intl.DateTimeFormat("en-SG", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Singapore",
            }).format(new Date(event.startsAt))
          : "Schedule not added"}
      </div>
      {event.submittedAt && (
        <p className="mt-1 text-xs text-slate-400">
          Submitted{" "}
          {new Intl.DateTimeFormat("en-SG", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Singapore",
          }).format(new Date(event.submittedAt))}
        </p>
      )}
      {event.expectedAttendance != null && (
        <p className="mt-1 text-xs text-slate-400">
          Expected attendance: {event.expectedAttendance}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-3 border-t border-slate-100 pt-4">
        <div className="flex flex-col gap-1 text-xs text-slate-500">
          <span>Organiser: {event.organiserName ?? "Unknown"}</span>
          <span>Coordinator: {event.assignedCoordinatorName ?? "Unassigned"}</span>
        </div>
        <Link
          to={`/events/${event.id}`}
          state={FROM_EVENTS_LIST_STATE}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          View details
        </Link>
        {(event.status === "confirmed" || event.status === "completed") && (
          <Link
            to={`/events/${event.id}/registrations`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            View registrations
          </Link>
        )}
        <EventHistoryButton eventId={event.id} />
        {!isReassignmentBlocked && (
          <Button type="button" variant={isAssigned ? "outline" : "default"} onClick={onAssign}>
            {isAssigned ? "Reassign" : "Assign coordinator"}
          </Button>
        )}
      </div>
    </article>
  );
}

function LeadEmptyState({ tab }: { tab: LeadTab }) {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <CalendarDays aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">
          {tab === "queue" ? "No unassigned events" : "No events assigned yet"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          {tab === "queue"
            ? "New event requests appear here as soon as an organiser submits one."
            : "Assign a coordinator to an unassigned request to see it here."}
        </p>
      </div>
    </section>
  );
}

function CoordinatorEmptyState() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <CalendarDays aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No events assigned yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          The Event Coordinator Lead assigns requests to you once they've been reviewed.
        </p>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-primary">
          <FilePlus2 aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No event requests yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Start with a name and save the rest for later.
        </p>
        <Link to="/events/new" className={buttonVariants({ className: "mt-5" })}>
          Create your first draft
        </Link>
      </div>
    </section>
  );
}

function LoadingList() {
  return (
    <div aria-label="Loading event requests" className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-56 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
      ))}
    </div>
  );
}

function DeleteDraftDialog({
  draft,
  onCancel,
  onConfirm,
}: {
  draft: EventDraftSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-draft-title"
        aria-describedby="delete-draft-description"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id="delete-draft-title" className="text-lg font-semibold text-slate-950">
          Delete this draft?
        </h2>
        <p id="delete-draft-description" className="mt-2 text-sm leading-6 text-slate-600">
          “{draft.title}” and its saved requirements will be permanently removed.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelButton} type="button" variant="outline" onClick={onCancel}>
            Keep draft
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Delete draft
          </Button>
        </div>
      </div>
    </div>
  );
}

function CancelRequestDialog({
  request,
  onCancel,
  onConfirm,
}: {
  request: EventDraftSummary;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-request-title"
        aria-describedby="cancel-request-description"
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h2 id="cancel-request-title" className="text-lg font-semibold text-slate-950">
          Cancel this request?
        </h2>
        <p id="cancel-request-description" className="mt-2 text-sm leading-6 text-slate-600">
          “{request.title}” will be withdrawn before the coordinator decides on it. This cannot be
          undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button ref={cancelButton} type="button" variant="outline" onClick={onCancel}>
            Keep request
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm}>
            Cancel request
          </Button>
        </div>
      </div>
    </div>
  );
}
