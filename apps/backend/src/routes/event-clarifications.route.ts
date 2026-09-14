import type { PostgrestError } from "@supabase/supabase-js";
import { clarificationPermittedFieldKeys } from "@spm/shared";
import { Router } from "express";
import { z } from "zod";

import { ApplicationError } from "../errors/application-error";
import { asyncHandler } from "../lib/async-handler";
import { getServiceClient } from "../lib/supabase-service-client";
import { requireAuth } from "../middleware/auth";

export const eventClarificationsRouter = Router();

const eventIdParamsSchema = z.object({ eventId: z.uuid() });
const clarificationIdParamsSchema = z.object({ clarificationId: z.uuid() });

const requestBodySchema = z.object({
  question: z.string().trim().min(1).max(2_000),
  permittedFields: z.array(z.enum(clarificationPermittedFieldKeys)).default([]),
});

const respondBodySchema = z.object({
  response: z.string().trim().min(1).max(5_000),
});

/**
 * All three routes insert a `notifications` row, which has no INSERT policy
 * for regular users — same reason `event-submissions.route.ts` calls through
 * the service client instead of letting the browser call the RPC directly
 * (docs/architecture/adr/0003-submission-through-backend.md). Each route only
 * authenticates, validates shape, and translates the SQLSTATE; the business
 * rules live in the three `security definer` functions in
 * `202609140003_event_clarifications.sql`.
 */
eventClarificationsRouter.post(
  "/events/:eventId/clarifications",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = eventIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid event id");
    }

    const body = requestBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError(
        "VALIDATION",
        "Describe what information is needed",
      );
    }

    const { data, error } = await getServiceClient().rpc(
      "request_event_clarification",
      {
        p_event_id: params.data.eventId,
        p_question: body.data.question,
        p_permitted_fields: body.data.permittedFields,
        p_actor_id: req.userId,
      },
    );

    if (error) throw mapClarificationError(error);

    res.json({ data });
  }),
);

eventClarificationsRouter.post(
  "/clarifications/:clarificationId/respond",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = clarificationIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid clarification id");
    }

    const body = respondBodySchema.safeParse(req.body);
    if (!body.success) {
      throw new ApplicationError("VALIDATION", "Enter a response before submitting");
    }

    const { data, error } = await getServiceClient().rpc(
      "respond_event_clarification",
      {
        p_clarification_id: params.data.clarificationId,
        p_response: body.data.response,
        p_actor_id: req.userId,
      },
    );

    if (error) throw mapClarificationError(error);

    res.json({ data });
  }),
);

eventClarificationsRouter.post(
  "/clarifications/:clarificationId/resolve",
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = clarificationIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      throw new ApplicationError("VALIDATION", "Enter a valid clarification id");
    }

    const { data, error } = await getServiceClient().rpc(
      "resolve_event_clarification",
      {
        p_clarification_id: params.data.clarificationId,
        p_actor_id: req.userId,
      },
    );

    if (error) throw mapClarificationError(error);

    res.json({ data });
  }),
);

/** Mirrors event-submissions.route.ts's mapSubmitEventRequestError. */
function mapClarificationError(
  error: PostgrestError,
): ApplicationError | PostgrestError {
  if (error.code === "42501") {
    return new ApplicationError("FORBIDDEN", error.message, error);
  }

  if (error.code === "23514") {
    return new ApplicationError("VALIDATION", error.message, error);
  }

  return error;
}
