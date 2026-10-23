import type { Json } from "@spm/shared";
import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventChangeRequestsRouter = Router();

const eventIdParamsSchema = z.object({ eventId: z.uuid() });
const changeRequestIdParamsSchema = z.object({ changeRequestId: z.uuid() });

const submitBodySchema = z.object({
  requestedChanges: z.record(z.string(), z.unknown()),
  reason: z.string().trim().min(1).max(2_000),
});

// SPM-39 AC05/AC06: approval needs implementation notes, rejection a reason.
const decideBodySchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reviewNotes: z.string().trim().max(2_000).optional(),
  })
  .refine((body) => Boolean(body.reviewNotes), { path: ["reviewNotes"] });

// The same form payload update_event_as_coordinator takes (toEventDraftPayload).
const applyBodySchema = z.object({
  updates: z.record(z.string(), z.unknown()),
});

/**
 * All three routes insert a `notifications` row, which has no INSERT policy
 * for regular users, so they go through the service client — same pattern as
 * event-clarifications.route.ts. Business rules (including the Lead fallback
 * for an unassigned event) live in the `security definer` functions in
 * 202610200013_submit_event_change_request.sql and, for applying an approved
 * change (SPM-39), 202610230005_spm39_apply_event_change_request.sql.
 */
eventChangeRequestsRouter.post(
  "/events/:eventId/change-requests",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const body = submitBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError(
        "VALIDATION",
        "Describe the change you are requesting and explain the reason",
      );
    }

    const { data, error } = await getServiceClient().rpc(
      "submit_event_change_request",
      {
        p_event_id: params.data.eventId,
        p_requested_changes: body.data.requestedChanges as Json,
        p_reason: body.data.reason,
        p_actor_id: req.userId,
      },
    );

    if (error) throw mapChangeRequestError(error);

    res.json({ data });
  }),
);

eventChangeRequestsRouter.post(
  "/change-requests/:changeRequestId/decide",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = changeRequestIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid change request id");
    }

    const body = decideBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError(
        "VALIDATION",
        req.body?.decision === "approved"
          ? "Add implementation notes before approving this change request"
          : req.body?.decision === "rejected"
            ? "Explain the reason for rejecting this change request"
            : "Choose approve or reject",
      );
    }

    const { data, error } = await getServiceClient().rpc(
      "decide_event_change_request",
      {
        p_change_request_id: params.data.changeRequestId,
        p_decision: body.data.decision,
        p_review_notes: body.data.reviewNotes,
        p_actor_id: req.userId,
      },
    );

    if (error) throw mapChangeRequestError(error);

    res.json({ data });
  }),
);

// SPM-39 AC07: the assigned coordinator applies an approved change. The
// function flags affected arrangements and notifies staff, so it needs the
// service client too.
eventChangeRequestsRouter.post(
  "/change-requests/:changeRequestId/apply",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = changeRequestIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid change request id");
    }

    const body = applyBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Enter the event's new details");
    }

    const { data, error } = await getServiceClient().rpc(
      "apply_event_change_request",
      {
        p_change_request_id: params.data.changeRequestId,
        p_updates: body.data.updates as Json,
        p_actor_id: req.userId,
      },
    );

    if (error) throw mapChangeRequestError(error);

    res.json({ data });
  }),
);

eventChangeRequestsRouter.post(
  "/change-requests/:changeRequestId/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = changeRequestIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid change request id");
    }

    const { data, error } = await getServiceClient().rpc(
      "withdraw_event_change_request",
      {
        p_change_request_id: params.data.changeRequestId,
        p_actor_id: req.userId,
      },
    );

    if (error) throw mapChangeRequestError(error);

    res.json({ data });
  }),
);

/** Mirrors event-clarifications.route.ts's mapClarificationError. */
function mapChangeRequestError(
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
