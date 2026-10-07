import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const venueBookingHoldRouter = Router();

const bookingIdParamsSchema = z.object({ bookingId: z.uuid() });
const placeHoldBodySchema = z.object({ expiresAt: z.iso.datetime({ offset: true }) });

/**
 * place_venue_booking_hold now inserts the hold's scheduled reminder
 * notifications (24-hours-before and at-expiry), which has no INSERT policy
 * for regular users, so this goes through the service client rather than a
 * direct supabase-js call from the browser — same reasoning as
 * venue-booking-decisions.route.ts.
 */
venueBookingHoldRouter.post(
  "/venue-bookings/:bookingId/hold",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = bookingIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid venue booking request id");
    }

    const body = placeHoldBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Enter an expiry date and time in the future");
    }

    const { data, error } = await getServiceClient().rpc("place_venue_booking_hold", {
      p_booking_id: params.data.bookingId,
      p_expires_at: body.data.expiresAt,
      p_actor_id: req.userId,
    });

    if (error) throw mapHoldError(error);

    res.json({ data });
  }),
);

/**
 * confirm_venue_booking_hold now deletes the hold's still-pending reminder
 * notifications, which has no DELETE policy for regular users, so this also
 * goes through the service client.
 */
venueBookingHoldRouter.post(
  "/venue-bookings/:bookingId/confirm-hold",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = bookingIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid venue booking request id");
    }

    const { data, error } = await getServiceClient().rpc("confirm_venue_booking_hold", {
      p_booking_id: params.data.bookingId,
      p_actor_id: req.userId,
    });

    if (error) throw mapHoldError(error);

    res.json({ data });
  }),
);

function mapHoldError(error: PostgrestError): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  return error;
}
