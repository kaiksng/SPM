import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { venueBookingDetailsSchema } from "@spm/shared";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const venueBookingSubmissionsRouter = Router();

const submitBodySchema = z.object({
  eventId: z.uuid(),
  venueId: z.uuid(),
  // SPM-85: present only for an additional venue; the event's first booking
  // takes its label, period, headcount and needs from the event.
  details: venueBookingDetailsSchema.optional(),
});
const bookingIdParamsSchema = z.object({ bookingId: z.uuid() });

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
      const detailsIssue = body.error.issues.find((issue) => issue.path[0] === "details");
      throw new ApplicationError(
        "VALIDATION",
        detailsIssue ? detailsIssue.message : "Select a venue to request",
      );
    }

    const details = body.data.details;
    const { data, error } = await getServiceClient().rpc("submit_venue_booking_request", {
      p_event_id: body.data.eventId,
      p_venue_id: body.data.venueId,
      p_actor_id: req.userId,
      ...(details && {
        p_label: details.label,
        p_starts_at: details.startsAt,
        p_ends_at: details.endsAt,
        p_expected_headcount: details.expectedHeadcount,
        p_layout_notes: details.layoutNotes,
        p_accessibility_notes: details.accessibilityNotes,
        p_required_facilities: details.requiredFacilities,
      }),
    });

    if (error) throw mapSubmitError(error);

    res.json({ data });
  }),
);

/**
 * withdraw_venue_booking_request now notifies every venue-staff profile too,
 * same reasoning as the submit route above. SPM-85: it also cancels an Approved
 * booking, and a reason is required for either.
 */
venueBookingSubmissionsRouter.post(
  "/venue-bookings/:bookingId/withdraw",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = bookingIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid venue booking request id");
    }

    const body = withdrawBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Give a reason for withdrawing or cancelling this venue booking");
    }

    const { data, error } = await getServiceClient().rpc("withdraw_venue_booking_request", {
      p_booking_id: params.data.bookingId,
      p_actor_id: req.userId,
      p_reason: body.data.reason,
    });

    if (error) throw mapSubmitError(error);

    res.json({ data });
  }),
);

const withdrawBodySchema = z.object({ reason: z.string().trim().min(1).max(500) });

const replacementBodySchema = z.object({ venueId: z.uuid() });

/**
 * SPM-82: request a replacement venue for a disrupted booking. Like submit,
 * it notifies every venue-staff profile (no INSERT policy for regular
 * users), so it goes through the service client.
 */
venueBookingSubmissionsRouter.post(
  "/venue-bookings/:bookingId/replacement",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = bookingIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid venue booking id");
    }
    const body = replacementBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Select a venue to request");
    }

    const { data, error } = await getServiceClient().rpc("request_replacement_venue", {
      p_booking_id: params.data.bookingId,
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
