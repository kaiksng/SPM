import { safetyCheckOutstandingItemsSchema } from "@spm/shared";
import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventSafetyCheckRouter = Router();

const eventIdParamsSchema = z.object({
  eventId: z.uuid(),
});

/**
 * AC05/AC06. Submission is one Postgres transaction (see
 * public.submit_event_for_safety_check), re-checking readiness itself rather
 * than trusting whatever the frontend last read; this route only
 * authenticates the caller, validates the path parameter, and translates the
 * function's result into an HTTP response. No GET readiness route: the
 * frontend reads public.event_readiness directly via supabase.rpc under RLS,
 * same as other read-only RPCs.
 */
eventSafetyCheckRouter.post(
  "/:eventId/submit-safety-check",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);

    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const { data, error } = await getServiceClient().rpc(
      "submit_event_for_safety_check",
      { p_event_id: params.data.eventId, p_actor_id: req.userId },
    );

    if (error) {
      throw mapSubmitSafetyCheckError(error);
    }

    res.json({ data });
  }),
);

/**
 * Any SQLSTATE besides the two below is unexpected — thrown as-is so it
 * falls through to error-handler's catch-all 500, which logs it rather than
 * disguising it as something the coordinator could act on.
 */
function mapSubmitSafetyCheckError(
  error: PostgrestError,
): ApplicationError | PostgrestError {
  // insufficient_privilege: not the assigned coordinator, or not Planning.
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  // check_violation: either the event isn't Planning, or it isn't Ready —
  // the function packs every outstanding item into `detail` as a JSON array
  // (AC05) so the frontend can list them all at once.
  if (error.code === "23514") {
    const items = safetyCheckOutstandingItemsSchema.safeParse(
      safeJsonParse(error.details),
    );
    return new ApplicationError(
      "VALIDATION",
      error.message,
      items.success ? items.data : undefined,
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
