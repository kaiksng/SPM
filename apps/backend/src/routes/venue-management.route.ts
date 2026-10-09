import type { Json } from "@spm/shared";
import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const venueManagementRouter = Router();

const venueIdParamsSchema = z.object({ venueId: z.uuid() });
const updateVenueBodySchema = z.object({ venue: z.record(z.string(), z.unknown()) });

/**
 * update_venue now re-checks (and may insert into) venue_booking_conflicts
 * when setup/turnaround time changes, which inserts `notifications` rows —
 * no INSERT policy for regular users, so this goes through the service
 * client rather than a direct supabase-js call from the browser, same
 * reasoning as venue-booking-decisions.route.ts. create_venue is unaffected
 * (a brand-new venue has no bookings to conflict with) and stays a direct
 * call from the frontend.
 */
venueManagementRouter.post(
  "/venues/:venueId/update",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = venueIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid venue id");
    }

    const body = updateVenueBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Enter the venue details");
    }

    const { data, error } = await getServiceClient().rpc("update_venue", {
      p_venue_id: params.data.venueId,
      p_venue: body.data.venue as Json,
      p_actor_id: req.userId,
    });

    if (error) throw mapVenueError(error);

    res.json({ data });
  }),
);

/** Venue Staff can run a conflict re-check for one venue, or all of them. */
venueManagementRouter.post(
  "/venues/:venueId/recheck-conflicts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = venueIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid venue id");
    }

    const { data, error } = await getServiceClient().rpc("recheck_venue_conflicts", {
      p_venue_id: params.data.venueId,
      p_actor_id: req.userId,
    });

    if (error) throw mapVenueError(error);

    res.json({ data });
  }),
);

venueManagementRouter.post(
  "/venues/recheck-conflicts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await getServiceClient().rpc("recheck_all_venue_conflicts", {
      p_actor_id: req.userId,
    });

    if (error) throw mapVenueError(error);

    res.json({ data });
  }),
);

/** Mirrors venues.ts's mapVenueRpcError (frontend), now that this write goes through the backend. */
function mapVenueError(error: PostgrestError): ApplicationError | PostgrestError {
  if (error.code === "23505") {
    const issue = safeJsonParse(error.details) as { field?: string; message?: string } | undefined;
    if (issue?.field && issue.message) {
      return new ApplicationError("VALIDATION", issue.message, [
        { field: issue.field, message: issue.message },
      ]);
    }
  }

  if (error.code === "23514") {
    const issues = safeJsonParse(error.details) as
      | Array<{ field: string; message: string }>
      | undefined;
    if (Array.isArray(issues)) {
      return new ApplicationError("VALIDATION", "Check the highlighted fields and try again.", issues);
    }
  }

  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "22P02" && error.message.includes("room_layout")) {
    return new ApplicationError(
      "VALIDATION",
      "Custom room layouts are not available yet. Ask the database owner to apply the custom-layout migration before saving.",
    );
  }

  return error;
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
