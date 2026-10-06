import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const venueBookingSubmissionsRouter = Router();

const submitBodySchema = z.object({ eventId: z.uuid(), venueId: z.uuid() });

/**
 * submit_venue_booking_request now notifies every venue-staff profile, which
 * inserts into `notifications` — no INSERT policy for regular users, so
 * this goes through the service client rather than a direct supabase-js
 * call from the browser, same reasoning as venue-booking-decisions.route.ts.
 */
venueBookingSubmissionsRouter.post(
  "/venue-bookings/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = submitBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Select a venue to request");
    }

    const { data, error } = await getServiceClient().rpc("submit_venue_booking_request", {
      p_event_id: body.data.eventId,
      p_venue_id: body.data.venueId,
      p_actor_id: req.userId,
    });

    if (error) throw mapSubmitError(error);

    res.json({ data });
  }),
);

function mapSubmitError(error: PostgrestError): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  return error;
}
