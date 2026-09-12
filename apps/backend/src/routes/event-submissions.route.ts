import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventSubmissionsRouter = Router();

const eventIdParamsSchema = z.object({
  eventId: z.uuid(),
});

/** Matches the {field, message} objects public.submit_event_request raises. */
const submissionIssueSchema = z.array(
  z.object({ field: z.string(), message: z.string() }),
);

/**
 * PB-03 AC05/AC06. Submission is one Postgres transaction (see
 * public.submit_event_request) so that a partially applied submission can
 * never happen; this route only authenticates the caller, validates the path
 * parameter, and translates the function's result into an HTTP response.
 */
eventSubmissionsRouter.post(
  "/:eventId/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);

    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const { data, error } = await getServiceClient().rpc(
      "submit_event_request",
      { p_event_id: params.data.eventId, p_actor_id: req.userId },
    );

    if (error) {
      throw mapSubmitEventRequestError(error);
    }

    res.json({ data });
  }),
);

/**
 * Any SQLSTATE besides the two below is unexpected — thrown as-is so it falls
 * through to error-handler's catch-all 500, which logs it rather than
 * disguising it as a validation failure the organiser could act on.
 */
function mapSubmitEventRequestError(
  error: PostgrestError,
): ApplicationError | PostgrestError {
  // insufficient_privilege: not the owner, wrong role, or already submitted.
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  // check_violation: the request is not complete enough to submit. The
  // function packs every affected field into `detail` as a JSON array so the
  // frontend can highlight all of them at once (AC06), the same way it
  // highlights a failed local validation.
  if (error.code === "23514") {
    const fields = submissionIssueSchema.safeParse(
      safeJsonParse(error.details),
    );
    return new ApplicationError(
      "VALIDATION",
      error.message,
      fields.success ? fields.data : undefined,
    );
  }

  return error;
}

function safeJsonParse(value: string | undefined): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
