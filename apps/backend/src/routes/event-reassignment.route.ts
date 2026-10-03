import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventReassignmentRouter = Router();

const eventIdParamsSchema = z.object({ eventId: z.uuid() });

const reassignBodySchema = z.object({
  reason: z.string().trim().min(1).max(2_000),
});

/**
 * Same reasoning as event-decisions.route.ts: auto_reassign_event_coordinator
 * inserts audit_logs and notifications rows, neither of which has a general
 * INSERT policy, so this goes through the service client rather than a
 * direct supabase-js call from the browser.
 *
 * Named distinctly from the not-yet-merged feature/coordinator-reassignment
 * branch's "/events/:eventId/reassign-coordinator" + reassign_event_coordinator
 * RPC (any coordinator, explicit target) so the two features don't collide —
 * this one is self-service (assigned coordinator only) with an automatic,
 * least-loaded target.
 */
eventReassignmentRouter.post(
  "/events/:eventId/auto-reassign-coordinator",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const body = reassignBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Explain why this event needs to be reassigned");
    }

    const { data, error } = await getServiceClient().rpc("auto_reassign_event_coordinator", {
      p_event_id: params.data.eventId,
      p_reason: body.data.reason,
      p_actor_id: req.userId,
    });

    if (error) throw mapReassignmentError(error);

    res.json({ data });
  }),
);

function mapReassignmentError(error: PostgrestError): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  return error;
}
