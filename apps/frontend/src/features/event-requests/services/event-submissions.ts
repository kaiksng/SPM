import {
  EventSubmissionError,
  eventSubmissionSchema,
  type EventRequestFormValues,
} from "@spm/shared";

import { ApiError, apiFetch } from "@/lib/api-client";

/**
 * Submits a draft event request for coordinator assignment and review.
 * Validates locally first so the organiser sees every problem without a
 * round trip; public.submit_event_request re-validates regardless, since the
 * database — not this schema — is authoritative (AC06).
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
    return await apiFetch(`/events/${eventId}/submit`, { method: "POST" });
  } catch (error) {
    if (error instanceof ApiError && error.fields) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of error.fields) {
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
