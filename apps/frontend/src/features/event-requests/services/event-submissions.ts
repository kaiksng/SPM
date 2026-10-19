import {
  EventSubmissionError,
  eventSubmissionSchema,
  type EventRequestFormValues,
} from "@spm/shared";

import { ApiError, apiFetch } from "@/lib/api-client";
import { saveEventDraft } from "@/features/event-requests/services/event-drafts";

/**
 * Submits a draft event request for coordinator assignment and review.
 * Validates locally first so the organiser sees every problem without a
 * round trip; public.submit_event_request re-validates regardless, since the
 * database — not this schema — is authoritative (AC06).
 *
 * public.submit_event_request only reads the row already stored in Postgres
 * — the backend route sends it nothing but the event id. So whatever the
 * organiser just typed into the form (including ticking the requirements
 * acknowledgement) must be persisted first, exactly as a draft save would,
 * or the database re-validates stale data and rejects a submission that
 * looks complete on screen.
 */
export async function submitEventRequest(
  eventId: string,
  values: EventRequestFormValues,
) {
  const result = eventSubmissionSchema.safeParse(values);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    throw new EventSubmissionError(
      "Check the highlighted fields and try again.",
      fieldErrors,
    );
  }

  try {
    await saveEventDraft(result.data, eventId);
    return await apiFetch(`/events/${eventId}/submit`, { method: "POST" });
  } catch (error) {
    if (error instanceof ApiError && error.fields) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.fields as Array<{ field: string; message: string }>) {
        fieldErrors[issue.field] = issue.message;
      }
      throw new EventSubmissionError(error.message, fieldErrors);
    }

    throw new EventSubmissionError(
      error instanceof Error
        ? error.message
        : "Your event request could not be submitted. Your form values are still here.",
    );
  }
}
