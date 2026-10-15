import type { PostgrestError } from "@supabase/supabase-js";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const venueSuggestionsRouter = Router();

const eventIdParamsSchema = z.object({ eventId: z.uuid() });

// Must match the role list in public.can_view_event — when that function
// changes, update this too (it drifted once: Leads were added to
// can_view_event in 202610050002 but not here, so Leads got 403).
const STAFF_ROLES = new Set([
  "event_coordinator",
  "venue_staff",
  "technical_support_staff",
  "event_coordinator_lead",
]);

/**
 * "Automatically Suggest Matching Venues": reverted back to calling
 * public.find_matching_venues (202609230004_restore_find_matching_venues.sql)
 * via RPC — the matching rules are one indexed SQL query with joins, faster
 * at any real data volume than the TypeScript port this route briefly used
 * (fetch-everything-then-filter-in-JS does more round trips and can't use
 * Postgres indexes).
 *
 * find_matching_venues relies on RLS (can_view_event) to enforce "you can
 * only see suggestions for events you can access" — but this route calls it
 * via the service-role client, which bypasses RLS entirely, so that check is
 * reproduced explicitly here (mirrors can_view_event in
 * 202609060001_initial_schema.sql: the organiser, the assigned coordinator,
 * or any internal staff role may view an event). This was a real gap in the
 * very first version of this route, caught while porting the logic to
 * TypeScript — kept even on reverting back to SQL.
 */
venueSuggestionsRouter.get(
  "/events/:eventId/suggested-venues",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }
    const eventId = params.data.eventId;
    const client = getServiceClient();

    const [{ data: event }, { data: requesterProfile }] = await Promise.all([
      client
        .from("events")
        .select("organiser_id, assigned_coordinator_id")
        .eq("id", eventId)
        .maybeSingle(),
      client.from("profiles").select("role").eq("id", req.userId!).maybeSingle(),
    ]);

    const canView =
      !!event &&
      (event.organiser_id === req.userId ||
        event.assigned_coordinator_id === req.userId ||
        STAFF_ROLES.has(requesterProfile?.role ?? ""));

    if (!canView) {
      throw new ApplicationError(
        "FORBIDDEN",
        "Event not found or you do not have access to it",
      );
    }

    const { data, error } = await client.rpc("find_matching_venues", {
      p_event_id: eventId,
    });

    if (error) throw mapSuggestedVenuesError(error);

    res.json({ data });
  }),
);

function mapSuggestedVenuesError(
  error: PostgrestError,
): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  return error;
}
