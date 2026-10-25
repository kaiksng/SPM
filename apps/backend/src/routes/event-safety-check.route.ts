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

// Reason is mandatory for Request Changes/Reject, optional for Approve —
// there's nothing to justify when everything checks out.
const decisionBodySchema = z
  .object({
    decision: z.enum(["changes_requested", "rejected", "approved"]),
    reason: z.string().trim().max(2_000).optional(),
    flaggedBookingIds: z.array(z.uuid()).default([]),
    flaggedRequirementIds: z.array(z.uuid()).default([]),
  })
  .refine((data) => data.decision === "approved" || !!data.reason, {
    message: "Explain the reason for this decision",
    path: ["reason"],
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
 * AC1/AC2/AC3/AC4/AC7: Request Changes, Reject, or Approve — a mandatory
 * reason for the first two, optional for Approve.
 * decide_event_safety_check is one Postgres transaction — validates the
 * caller is a Safety Officer, the event is Pending Safety Check, and (for
 * Request Changes) that every given id actually belongs to this event; this
 * route only authenticates, validates the body shape, and translates the
 * result. Goes through the service client because the function inserts
 * `notifications` rows, which have no INSERT policy for regular users.
 */
eventSafetyCheckRouter.post(
  "/:eventId/safety-check-decision",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const body = decisionBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError(
        "VALIDATION",
        body.error.issues[0]?.message ?? "Explain the reason for this decision",
      );
    }

    const { data, error } = await getServiceClient().rpc("decide_event_safety_check", {
      p_event_id: params.data.eventId,
      p_decision: body.data.decision,
      p_reason: body.data.reason ?? "",
      p_flagged_booking_ids: body.data.flaggedBookingIds,
      p_flagged_requirement_ids: body.data.flaggedRequirementIds,
      p_actor_id: req.userId,
    });

    if (error) throw mapSafetyCheckDecisionError(error);

    res.json({ data });
  }),
);

function mapSafetyCheckDecisionError(
  error: PostgrestError,
): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  return error;
}

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
