import type { NextFunction, Request, Response } from "express";

import { getServiceClient } from "../lib/supabase-service-client";
import { ApplicationError } from "../errors/application-error";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Verifies the Supabase access token sent by the frontend as
 * `Authorization: Bearer <token>`. Frontend auth (sign in/up/out) happens
 * client-side against Supabase directly — this middleware only confirms,
 * for backend routes, who the caller is. Authorization itself is still
 * enforced by RLS policies for anything read via the service client using
 * the caller's id.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    next(new ApplicationError("UNAUTHENTICATED", "You must sign in to continue"));
    return;
  }

  const { data, error } = await getServiceClient().auth.getUser(token);

  if (error || !data.user) {
    next(
      new ApplicationError(
        "UNAUTHENTICATED",
        "You must sign in to continue",
        error,
      ),
    );
    return;
  }

  req.userId = data.user.id;
  next();
}
