import { computeRegistrationState, type OwnRegistrationStatus } from "@spm/shared";
import { Calendar, Check, MapPin, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { eventBannerUrl } from "@/features/event-banners/services/event-banners";
import { RegistrationStatusBadge } from "@/features/registrations/components/registration-status-badge";
import { WithdrawRegistrationDialog } from "@/features/registrations/components/withdraw-registration-dialog";
import {
  loadAttendeeEventDetail,
  type AttendeeEventDetail,
} from "@/features/registrations/services/attendee-event";
import {
  getOwnRegistrationStatus,
  getRegisteredCount,
  getWaitlistPosition,
  joinWaitlist,
  leaveWaitlist,
  registerForEvent,
  withdrawRegistration,
} from "@/features/registrations/services/registrations";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

const dateTimeFormatter = new Intl.DateTimeFormat("en-SG", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Singapore",
});

/**
 * An attendee can now reach this page for an event they're (or were)
 * registered for even after it leaves 'confirmed' — see
 * can_attendee_view_event (202611010010). Previously this page only ever rendered for confirmed
 * events, so the hero pill hardcoded "Confirmed" and the whole action area
 * assumed registration was still possible; both need to reflect the real
 * status once that's no longer guaranteed.
 */
const EVENT_STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

export function EventRegistrationPage() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [event, setEvent] = useState<AttendeeEventDetail>();
  const [registeredCount, setRegisteredCount] = useState(0);
  const [ownStatus, setOwnStatus] = useState<OwnRegistrationStatus>(null);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string>();
  const [showWithdrawDialog, setShowWithdrawDialog] = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState<string>();

  usePageTitle(event?.title ? `Register — ${event.title}` : "Event registration");
  const bannerUrl = eventBannerUrl(event?.bannerPath ?? null);

  useEffect(() => {
    if (!eventId || !user) return;
    let active = true;
    setLoading(true);
    Promise.all([
      loadAttendeeEventDetail(eventId),
      getRegisteredCount(eventId),
      getOwnRegistrationStatus(eventId, user.id),
      getWaitlistPosition(eventId),
    ])
      .then(([detail, count, status, position]) => {
        if (!active) return;
        setEvent(detail);
        setRegisteredCount(count);
        setOwnStatus(status);
        setWaitlistPosition(position);
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
  }, [eventId, user]);

  async function handleRegister() {
    if (!eventId) return;
    setSubmitting(true);
    setActionError(undefined);
    try {
      await registerForEvent(eventId);
      setOwnStatus("registered");
      setRegisteredCount((count) => count + 1);
    } catch (registerError) {
      setActionError(
        registerError instanceof Error ? registerError.message : "Registration could not be completed.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoinWaitlist() {
    if (!eventId) return;
    setSubmitting(true);
    setActionError(undefined);
    try {
      await joinWaitlist(eventId);
      setOwnStatus("waitlisted");
      if (user) setWaitlistPosition(await getWaitlistPosition(eventId));
    } catch (joinError) {
      setActionError(
        joinError instanceof Error ? joinError.message : "Could not join the waiting list.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLeaveWaitlist() {
    if (!eventId) return;
    setSubmitting(true);
    setActionError(undefined);
    try {
      await leaveWaitlist(eventId);
      setOwnStatus(null);
      setWaitlistPosition(null);
    } catch (leaveError) {
      setActionError(
        leaveError instanceof Error ? leaveError.message : "Could not leave the waiting list.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * withdraw_registration promotes the longest-waiting attendee straight to
   * 'registered' in the same transaction — no invite/accept step, so this
   * attendee's own view only needs to reflect their own withdrawal.
   */
  async function handleWithdraw(reason: string) {
    if (!eventId) return;
    setActionError(undefined);
    try {
      await withdrawRegistration(eventId, reason);
      setOwnStatus(null);
      setRegisteredCount((count) => Math.max(count - 1, 0));
      setShowWithdrawDialog(false);
      setWithdrawNotice("You've withdrawn — your place has been released.");
    } catch (withdrawError) {
      const message =
        withdrawError instanceof Error ? withdrawError.message : "Could not withdraw your registration.";
      setActionError(message);
      throw withdrawError;
    }
  }

  const isConfirmed = event?.status === "confirmed";

  const state = event
    ? computeRegistrationState(
        {
          required: event.registration.required,
          opensAt: event.registration.opensAt,
          closesAt: event.registration.closesAt,
          capacity: event.registration.capacity,
        },
        registeredCount,
        ownStatus,
      )
    : undefined;

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-4xl">
          <button
            type="button"
            onClick={() => navigate("/browse-events")}
            className="-ml-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            ← Back to browse events
          </button>

          {loading ? (
            <div className="mt-6 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error || !event || !state ? (
            <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h1 className="font-semibold text-red-900">Event unavailable</h1>
              <p role="alert" className="mt-2 text-sm text-red-800">
                {error ?? "This event could not be found."}
              </p>
            </section>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {/* Opened from My Registrations or the cancellation notification:
                  say so first, not only beside the registration actions. */}
              {event.status === "cancelled" && (
                <section className="rounded-2xl border border-red-200 bg-red-50 p-5">
                  <h2 className="font-semibold text-red-900">This event was cancelled</h2>
                  <p className="mt-1 text-sm text-red-800">
                    {ownStatus === "registered"
                      ? "You were registered. Your place has been released."
                      : ownStatus === "waitlisted"
                        ? "You were on the waiting list and have been taken off it."
                        : "It will not go ahead."}
                  </p>
                </section>
              )}
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div
                  className="flex h-44 flex-col justify-between bg-gradient-to-br from-primary to-blue-900 bg-cover bg-center p-5"
                  style={
                    bannerUrl
                      ? { backgroundImage: `linear-gradient(to top, rgba(15,23,42,0.75), rgba(15,23,42,0.15)), url("${bannerUrl}")` }
                      : undefined
                  }
                >
                  <span className="w-fit rounded-full border border-white/40 bg-white/15 px-2.5 py-1 text-xs font-semibold text-white">
                    {EVENT_STATUS_LABELS[event.status] ?? event.status}
                  </span>
                  <h1 className="text-2xl font-semibold tracking-tight text-white">{event.title}</h1>
                </div>
                <div className="flex flex-wrap gap-5 p-6 text-sm text-slate-700">
                  <span className="flex items-center gap-2">
                    <Calendar className="size-4 text-primary" aria-hidden="true" />
                    {event.startsAt && event.endsAt
                      ? `${dateTimeFormatter.format(new Date(event.startsAt))} – ${dateTimeFormatter.format(new Date(event.endsAt))}`
                      : "Schedule not set"}
                  </span>
                  {event.venue.preferredLocation && (
                    <span className="flex items-center gap-2">
                      <MapPin className="size-4 text-primary" aria-hidden="true" />
                      {event.venue.preferredLocation}
                    </span>
                  )}
                  {event.organiserName && (
                    <span className="flex items-center gap-2">
                      <Users className="size-4 text-primary" aria-hidden="true" />
                      {event.organiserName}
                    </span>
                  )}
                </div>
                {event.description && (
                  <p className="px-6 pb-6 text-sm leading-6 text-slate-600">{event.description}</p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xs font-semibold tracking-[0.06em] text-slate-400 uppercase">
                    Registration
                  </h2>
                  {isConfirmed && (state === "full" || state === "waitlisted") && (
                    <RegistrationStatusBadge state={state} />
                  )}
                </div>

                {event.registration.required && event.registration.capacity !== null && (
                  <div className="mt-4">
                    <p className="mb-1.5 text-sm text-slate-700">
                      {Math.max(event.registration.capacity - registeredCount, 0)} of{" "}
                      {event.registration.capacity} spots left
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full ${state === "full" ? "bg-red-600" : "bg-primary"}`}
                        style={{
                          width: `${Math.min((registeredCount / event.registration.capacity) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {(event.registration.opensAt || event.registration.closesAt) && (
                  <p className="mt-3 text-sm text-slate-600">
                    Registration period:{" "}
                    {event.registration.opensAt
                      ? dateTimeFormatter.format(new Date(event.registration.opensAt))
                      : "No opening date"}{" "}
                    –{" "}
                    {event.registration.closesAt
                      ? dateTimeFormatter.format(new Date(event.registration.closesAt))
                      : "No closing date"}
                  </p>
                )}

                {withdrawNotice && (
                  <p role="status" className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                    {withdrawNotice}
                  </p>
                )}

                {actionError && (
                  <p role="alert" className="mt-4 text-sm text-red-700">
                    {actionError}
                  </p>
                )}

                <div className="mt-5 border-t border-slate-100 pt-5">
                  {!isConfirmed ? (
                    <p className="text-sm text-slate-600">
                      {event.status === "completed" ? (
                        <>
                          This event has ended.
                          {ownStatus === "registered" && " You were registered."}
                          {ownStatus === "waitlisted" && " You were on the waiting list."}
                        </>
                      ) : event.status === "cancelled" ? (
                        "Registration is closed because the event was cancelled."
                      ) : (
                        "This event was cancelled."
                      )}
                    </p>
                  ) : state === "open" ? (
                    <>
                      <p className="mb-3 text-xs text-slate-400">Registering as</p>
                      <div className="grid grid-cols-2 gap-3">
                        <ReadOnlyField label="Name" value={profile?.full_name ?? "—"} />
                        <ReadOnlyField label="Email" value={user?.email ?? "—"} />
                      </div>
                      <Button type="button" className="mt-5" disabled={submitting} onClick={handleRegister}>
                        {submitting ? "Registering…" : "Register"}
                      </Button>
                    </>
                  ) : state === "registered" ? (
                    <div>
                      <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
                        <Check className="mt-0.5 size-[18px] shrink-0 text-emerald-700" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold text-emerald-700">You&apos;re registered</p>
                          <p className="mt-1 text-sm text-emerald-700">Added to your registrations.</p>
                        </div>
                      </div>
                      {event.registration.withdrawalPermitted && (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-3"
                          onClick={() => setShowWithdrawDialog(true)}
                        >
                          Withdraw registration
                        </Button>
                      )}
                    </div>
                  ) : state === "waitlisted" ? (
                    <div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                        <p className="text-sm font-semibold text-amber-800">
                          You&apos;re on the waiting list
                          {waitlistPosition !== null && ` — position ${waitlistPosition}`}
                        </p>
                        <p className="mt-1 text-sm text-amber-800">
                          We&apos;ll register you automatically if a spot opens up. You can leave the
                          waiting list anytime.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3"
                        disabled={submitting}
                        onClick={handleLeaveWaitlist}
                      >
                        {submitting ? "Leaving…" : "Leave waiting list"}
                      </Button>
                    </div>
                  ) : state === "full" && event.registration.waitlistEnabled ? (
                    <div>
                      <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-800">
                        This event is full. Join the waiting list and we&apos;ll register you
                        automatically if a spot opens up.
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={handleJoinWaitlist}
                      >
                        {submitting ? "Joining…" : "Join waiting list"}
                      </Button>
                    </div>
                  ) : state === "full" ? (
                    <p className="text-sm text-amber-800">This event has reached capacity.</p>
                  ) : state === "not_required" ? (
                    <p className="text-sm text-slate-600">No registration needed for this event. Just come along.</p>
                  ) : state === "not_open" ? (
                    <p className="text-sm text-slate-600">
                      Registration opens{" "}
                      {event.registration.opensAt
                        ? dateTimeFormatter.format(new Date(event.registration.opensAt))
                        : "soon"}
                      . Check back then.
                    </p>
                  ) : (
                    <p className="text-sm text-slate-600">Registration for this event is closed.</p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate("/browse-events/my-registrations")}
                className={buttonVariants({ variant: "ghost", className: "self-start" })}
              >
                View my registrations
              </button>

              {showWithdrawDialog && (
                <WithdrawRegistrationDialog
                  eventTitle={event.title}
                  onCancel={() => setShowWithdrawDialog(false)}
                  onSubmit={handleWithdraw}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </RoleGate>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700">{label}</p>
      <div className="h-9 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-950">
        {value}
      </div>
    </div>
  );
}
