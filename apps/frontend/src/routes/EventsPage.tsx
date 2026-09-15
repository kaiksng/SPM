import {
  clarificationPermittedFieldLabels,
  type ClarificationPermittedField,
} from "@spm/shared";
import { CalendarDays, FilePlus2, Pencil, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { ClarificationPanel } from "@/features/event-requests/components/clarification-panel";
import { EventStatusBadge } from "@/features/event-requests/components/status-badges";
import {
  listAssignedEvents,
  type AssignedEventSummary,
} from "@/features/event-requests/services/assigned-events";
import { getClarificationReviewState } from "@/features/event-requests/services/clarifications";
import {
  deleteEventDraft,
  listEventRequests,
  type EventDraftSummary,
} from "@/features/event-requests/services/event-drafts";
import { PagePlaceholder } from "@/features/workspace/components/page-placeholder";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

type LocationState = { notice?: string } | null;

export function EventsPage() {
  usePageTitle("Events");
  const { profile } = useAuth();

  if (profile?.role === "event_organiser") return <OrganiserEventsView />;
  if (profile?.role === "event_coordinator") return <CoordinatorEventsView />;

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

  const notice = (state as LocationState)?.notice;

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-blue-600 uppercase">
                Organiser workspace
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
                Event requests
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Prepare requests at your own pace. Drafts stay private and do not
                enter review until you submit them.
              </p>
            </div>
            <Link to="/events/new" className={buttonVariants({ size: "lg" })}>
              <FilePlus2 /> Create event request
            </Link>
          </header>

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
          ) : (
            <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  onDelete={() => setDraftToDelete(event)}
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
    </RoleGate>
  );
}

function CoordinatorEventsView() {
  const { user } = useAuth();
  const { state } = useLocation();
  const [events, setEvents] = useState<AssignedEventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

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

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <header className="border-b border-slate-200 pb-7">
            <p className="text-xs font-semibold tracking-[0.16em] text-blue-600 uppercase">
              Coordinator workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              Assigned events
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Events automatically assigned to you appear here as soon as an
              organiser submits their request.
            </p>
          </header>

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
          ) : (
            <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event) => (
                <AssignedEventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function EventCard({
  event,
  onDelete,
}: {
  event: EventDraftSummary;
  onDelete: () => void;
}) {
  const isDraft = event.status === "draft";
  // PB-03 AC07: a requested event may still be edited by its organiser
  // before it is approved.
  const isRequested = event.status === "requested";
  const [reviewState, setReviewState] = useState<"open" | "answered">();
  return (
    <article className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_50px_-34px_rgba(37,99,235,0.35)] motion-reduce:transform-none">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <EventStatusBadge
            status={event.status}
            reviewState={reviewState === "open" ? "open" : undefined}
            role="organiser"
          />
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          Updated {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(event.updatedAt))}
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
          }).format(new Date(event.submittedAt))}
        </p>
      )}
      {/* PB-04 AC02: the organiser can see who is coordinating their request. */}
      {event.assignedCoordinatorName && (
        <p className="mt-1 text-xs text-slate-500">
          Coordinator: {event.assignedCoordinatorName}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-100 pt-4">
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
          <Link
            to={`/events/${event.id}/edit`}
            className={buttonVariants({ variant: "outline" })}
          >
            <Pencil /> Edit request
          </Link>
        ) : (
          <>
            <Link
              to={`/events/${event.id}`}
              className={buttonVariants({ variant: "outline" })}
            >
              View details
            </Link>
            <span className="self-center text-sm text-slate-500">
              Editing is unavailable in this workflow.
            </span>
          </>
        )}
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

function AssignedEventCard({ event }: { event: AssignedEventSummary }) {
  const [reviewState, setReviewState] = useState<{
    status: "open" | "answered";
    permittedFields: string[];
  }>();

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
    <Link
      to={`/events/${event.id}`}
      className="group flex min-h-56 flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_45px_-38px_rgba(15,23,42,0.55)] transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_22px_50px_-34px_rgba(37,99,235,0.35)] motion-reduce:transform-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <EventStatusBadge
            status={event.status}
            reviewState={reviewState?.status === "open" ? "open" : undefined}
            role="coordinator"
          />
        </div>
        <span className="shrink-0 text-xs text-slate-400">
          Updated {new Intl.DateTimeFormat("en-SG", { dateStyle: "medium" }).format(new Date(event.updatedAt))}
        </span>
      </div>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-slate-950 group-hover:text-blue-700">
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
            }).format(new Date(event.startsAt))
          : "Schedule not added"}
      </div>
      {event.submittedAt && (
        <p className="mt-1 text-xs text-slate-400">
          Submitted{" "}
          {new Intl.DateTimeFormat("en-SG", {
            dateStyle: "medium",
            timeStyle: "short",
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
      <span className="mt-auto pt-4 text-sm font-medium text-blue-600 group-hover:underline">
        View details
      </span>
    </Link>
  );
}

function CoordinatorEmptyState() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <CalendarDays aria-hidden="true" />
        </span>
        <h2 className="mt-5 text-lg font-semibold text-slate-950">No events assigned yet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Events are assigned automatically when an organiser submits a request.
        </p>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="mt-7 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
      <div className="max-w-sm py-12">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-blue-50 text-blue-600">
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
