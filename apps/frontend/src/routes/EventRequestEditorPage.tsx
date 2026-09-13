import {
  emptyEventRequestFormValues,
  eventSubmissionSchema,
  type EventRequestFormValues,
} from "@spm/shared";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/context/auth-context";
import { EventRequestForm } from "@/features/event-requests/components/event-request-form";
import {
  loadEventDraft,
  saveEventDraft,
} from "@/features/event-requests/services/event-drafts";
import { submitEventRequest } from "@/features/event-requests/services/event-submissions";
import { usePageTitle } from "@/hooks/use-page-title";
import { RoleGate } from "@/routes/RoleGate";

/**
 * PB-02 owns draft persistence ("draft" mode). PB-03 extends the same form
 * with a stricter schema and a submission action ("submit" mode) rather than
 * creating a second event-request page — see
 * docs/requirements/pb-02-event-request-form-contract.md.
 */
export function EventRequestEditorPage({
  mode = "draft",
}: {
  mode?: "draft" | "submit";
}) {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [initialValues, setInitialValues] = useState<EventRequestFormValues>();
  const [loading, setLoading] = useState(Boolean(eventId));
  const [error, setError] = useState<string>();
  const editing = Boolean(eventId);
  const submitting = mode === "submit";

  usePageTitle(
    submitting
      ? "Submit event request"
      : editing
        ? "Edit event draft"
        : "Create event request",
  );

  useEffect(() => {
    if (!eventId || profile?.role !== "event_organiser") {
      setInitialValues(structuredClone(emptyEventRequestFormValues));
      setLoading(false);
      return;
    }

    let active = true;
    loadEventDraft(eventId)
      .then((draft) => {
        if (active) setInitialValues(draft);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "This request could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [eventId, profile?.role]);

  if (profile?.role !== "event_organiser") {
    return (
      <RoleGate>
        <div className="grid min-h-[70vh] place-items-center bg-slate-50 px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-red-700">Access denied</p>
            <h1 className="mt-2 text-2xl font-semibold text-slate-950">
              Event Organiser access is required
            </h1>
            <Link
              to="/home"
              className={buttonVariants({ variant: "outline", className: "mt-6" })}
            >
              Return to dashboard
            </Link>
          </div>
        </div>
      </RoleGate>
    );
  }

  async function handleSave(values: EventRequestFormValues) {
    if (submitting && eventId) {
      await submitEventRequest(eventId, values);
      navigate("/events", {
        replace: true,
        state: { notice: "Event request submitted." },
      });
      return;
    }

    await saveEventDraft(values, eventId);
    navigate("/events", {
      replace: true,
      state: { notice: editing ? "Draft updated." : "Draft saved." },
    });
  }

  return (
    <RoleGate>
      <div className="min-h-full bg-slate-50/70 px-4 py-8 sm:px-7 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <Link
            to="/events"
            className={buttonVariants({ variant: "ghost", className: "-ml-2" })}
          >
            <ArrowLeft /> Back to event requests
          </Link>
          <header className="mt-6 border-b border-slate-200 pb-7">
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                {submitting ? "Ready to submit" : "Draft"}
              </span>
              <span className="text-xs text-slate-500">
                {submitting
                  ? "Reviewed by a coordinator once submitted"
                  : "Not submitted for review"}
              </span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-slate-950">
              {submitting
                ? "Submit your event request"
                : editing
                  ? "Continue your event request"
                  : "Create an event request"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              {submitting
                ? "Complete every mandatory field below. Submitting assigns a coordinator and starts the review."
                : "Start with an event name. You can save now and return to complete the remaining requirements later."}
            </p>
          </header>

          {loading ? (
            <div className="mt-7 h-96 animate-pulse rounded-2xl bg-slate-200/70 motion-reduce:animate-none" />
          ) : error ? (
            <section className="mt-7 rounded-2xl border border-red-200 bg-red-50 p-6">
              <h2 className="font-semibold text-red-900">Request unavailable</h2>
              <p role="alert" className="mt-2 text-sm text-red-800">{error}</p>
              <Link
                to="/events"
                className={buttonVariants({ variant: "outline", className: "mt-5" })}
              >
                Return to event requests
              </Link>
            </section>
          ) : initialValues ? (
            <div className="mt-7">
              <EventRequestForm
                key={eventId ?? "new"}
                initialValues={initialValues}
                onSave={handleSave}
                onCancel={() => navigate("/events")}
                validationSchema={submitting ? eventSubmissionSchema : undefined}
                submitLabel={submitting ? "Submit request" : undefined}
              />
            </div>
          ) : null}
        </div>
      </div>
    </RoleGate>
  );
}
