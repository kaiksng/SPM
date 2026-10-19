import { supabase } from "./supabase-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

/**
 * Thrown by apiFetch on a non-OK response. `fields` carries whatever
 * {field, message}[]-shaped (or similar, e.g. {code, message}[]) array a
 * validation (422) response may include — see
 * apps/backend/src/middleware/error-handler.ts — so a caller such as
 * EventRequestForm can highlight every affected field, not just show a
 * single message (PB-03 AC06). Left untyped since different RPCs use
 * different key names; callers narrow it themselves (zod, or a direct cast
 * where the shape is already known).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fields?: unknown[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Only for calling apps/backend's privileged/business-logic routes. Simple
 * reads/writes covered by RLS should go straight through `supabase` instead
 * — see packages/shared and AGENTS notes for the split.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  const response = await fetch(`${BACKEND_URL}${path}`, { ...init, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.error ?? `Request failed with status ${response.status}`,
      response.status,
      body.fields,
    );
  }

  return response.json();
}
