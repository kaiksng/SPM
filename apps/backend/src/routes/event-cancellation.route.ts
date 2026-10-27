import { cancelEventBodySchema } from "@spm/shared";
import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventCancellationRouter = Router();

const eventIdParamsSchema = z.object({ eventId: z.uuid() });

/**
 * cancel_event inserts `notifications` rows (organiser, coordinator,
 * attendees, and role broadcasts), which regular users have no INSERT
 * policy for, so this goes through the service client rather than a direct
 * supabase-js call from the browser — same reasoning as
 * event-decisions.route.ts.
 */
eventCancellationRouter.post(
  "/events/:eventId/cancel",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const body = cancelEventBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Give a reason for cancelling this event");
    }

    const { data, error } = await getServiceClient().rpc("cancel_event", {
      p_event_id: params.data.eventId,
      p_reason: body.data.reason,
      p_actor_id: req.userId,
    });

    if (error) throw mapCancelEventError(error);

    res.json({ data });
  }),
);

function mapCancelEventError(error: PostgrestError): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  return error;
}
