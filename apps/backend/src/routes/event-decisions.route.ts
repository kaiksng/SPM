import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventDecisionsRouter = Router();

const eventIdParamsSchema = z.object({ eventId: z.uuid() });

// AC03: only rejection requires a reason — approval may omit it. The
// database is authoritative (decide_event_request re-checks this), this
// schema only avoids a needless round trip for the common failure.
const decideBodySchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    rationale: z.string().trim().max(2_000),
  })
  .refine((value) => value.decision !== "rejected" || value.rationale.length > 0, {
    message: "Explain the reason for rejecting this event",
    path: ["rationale"],
  });

/**
 * Same reasoning as event-clarifications.route.ts: decide_event_request
 * inserts a `notifications` row, which has no INSERT policy for regular
 * users, so this goes through the service client rather than a direct
 * supabase-js call from the browser.
 */
eventDecisionsRouter.post(
  "/events/:eventId/decide",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const body = decideBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Explain the reason for this decision");
    }

    const { data, error } = await getServiceClient().rpc("decide_event_request", {
      p_event_id: params.data.eventId,
      p_decision: body.data.decision,
      p_rationale: body.data.rationale,
      p_actor_id: req.userId,
    });

    if (error) throw mapDecisionError(error);

    res.json({ data });
  }),
);

function mapDecisionError(error: PostgrestError): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  return error;
}
