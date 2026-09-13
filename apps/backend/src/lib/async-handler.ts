import type { NextFunction, Request, Response } from "express";

/**
 * Express 4 does not forward a rejected promise to error-handling middleware
 * on its own — an unhandled rejection would otherwise crash the request
 * silently instead of reaching errorHandler.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
