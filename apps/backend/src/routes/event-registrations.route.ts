import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventRegistrationsRouter = Router();

const eventIdParamsSchema = z.object({ eventId: z.uuid() });

/**
 * register_for_event re-checks everything (confirmed status, registration
 * window, capacity, duplicate) inside one statement, so two concurrent
 * registrations can't both slip past a "spots left" check that was only
 * valid at read time — same reasoning as decide_event_request going through
 * the service client rather than a direct supabase-js call from the
 * browser.
 */
eventRegistrationsRouter.post(
  "/events/:eventId/register",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const { data, error } = await getServiceClient().rpc("register_for_event", {
      p_event_id: params.data.eventId,
      p_actor_id: req.userId,
    });

    if (error) throw mapRegistrationError(error);

    res.json({ data });
  }),
);

function mapRegistrationError(error: PostgrestError): ApplicationError | PostgrestError {
  if (error.code === "P0002") {
    return new ApplicationError("NOT_FOUND", "This event could not be found", error);
  }

  if (error.code === "23505") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  return error;
}
