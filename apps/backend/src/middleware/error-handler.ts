import type { NextFunction, Request, Response } from "express";

import { ApplicationError } from "../errors/application-error";

const STATUS_BY_CODE: Record<ApplicationError["code"], number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
};

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApplicationError) {
    // VALIDATION errors may carry a {field, message}[] in `cause` (see
    // routes/event-submissions.route.ts) so the frontend can highlight every
    // affected field at once, the same way it highlights a failed local
    // validation.
    const fields = Array.isArray(err.cause) ? err.cause : undefined;
    res
      .status(STATUS_BY_CODE[err.code])
      .json({ error: err.message, ...(fields ? { fields } : {}) });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
