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
    res.status(STATUS_BY_CODE[err.code]).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}
