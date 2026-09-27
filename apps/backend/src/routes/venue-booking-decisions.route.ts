import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const venueBookingDecisionsRouter = Router();

const bookingIdParamsSchema = z.object({ bookingId: z.uuid() });

// AC02: only rejection requires a reason — approval may omit it. The
// database is authoritative (decide_venue_booking_request re-checks this),
// this schema only avoids a needless round trip for the common failure.
const decideBodySchema = z
  .object({
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(2_000),
  })
  .refine((value) => value.decision !== "rejected" || value.reason.length > 0, {
    message: "Explain the reason for rejecting this venue booking request",
    path: ["reason"],
  });

/**
 * Same reasoning as event-decisions.route.ts: decide_venue_booking_request
 * inserts a `notifications` row for the requesting coordinator, which has no
 * INSERT policy for regular users, so this goes through the service client
 * rather than a direct supabase-js call from the browser.
 */
venueBookingDecisionsRouter.post(
  "/venue-bookings/:bookingId/decide",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = bookingIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid venue booking request id");
    }

    const body = decideBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Explain the reason for this decision");
    }

    const { data, error } = await getServiceClient().rpc("decide_venue_booking_request", {
      p_booking_id: params.data.bookingId,
      p_decision: body.data.decision,
      p_reason: body.data.reason,
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
