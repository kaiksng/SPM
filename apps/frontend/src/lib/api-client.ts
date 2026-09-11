import { supabase } from "./supabase-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

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
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }

  return response.json();
}
