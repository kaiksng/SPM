import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, fetchMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  fetchMock: vi.fn(),
}));

vi.mock("./supabase-client", () => ({ supabase: { auth: { getSession: getSessionMock } } }));

import { ApiError, apiFetch } from "./api-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function sentHeaders() {
  return fetchMock.mock.calls[0]![1].headers as Headers;
}

beforeEach(() => {
  getSessionMock.mockReset().mockResolvedValue({ data: { session: { access_token: "token-1" } } });
  fetchMock.mockReset().mockResolvedValue(jsonResponse({ data: "ok" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  // SPM-13 AC03: the backend confirms who is calling from this token.
  it("SPM-13 AC03: sends the signed-in user's token to the backend as JSON", async () => {
    await expect(apiFetch("/events/event-1/cancel", { method: "POST", body: "{}" })).resolves.toEqual({ data: "ok" });

    expect(fetchMock).toHaveBeenCalledWith(
      `${BACKEND_URL}/events/event-1/cancel`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
    expect(sentHeaders().get("Authorization")).toBe("Bearer token-1");
    expect(sentHeaders().get("Content-Type")).toBe("application/json");
  });

  it("sends no Authorization header when nobody is signed in", async () => {
    getSessionMock.mockResolvedValue({ data: { session: null } });

    await apiFetch("/health");

    expect(sentHeaders().has("Authorization")).toBe(false);
  });

  it("keeps any header the caller set", async () => {
    await apiFetch("/health", { headers: { "X-Request": "abc" } });

    expect(sentHeaders().get("X-Request")).toBe("abc");
  });

  it("throws the backend's message, status and field issues on a refusal", async () => {
    const fields = [{ field: "title", message: "Enter a name" }];
    fetchMock.mockResolvedValue(jsonResponse({ error: "Check the fields", fields }, 422));

    const error = await apiFetch("/events").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: "ApiError", message: "Check the fields", status: 422, fields });
  });

  it("falls back to the status when a refusal carries no message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403));

    await expect(apiFetch("/events")).rejects.toMatchObject({
      message: "Request failed with status 403",
      status: 403,
      fields: undefined,
    });
  });

  it("copes with a failure whose body is not JSON", async () => {
    fetchMock.mockResolvedValue(new Response("Bad gateway", { status: 502 }));

    await expect(apiFetch("/events")).rejects.toMatchObject({
      message: "Request failed with status 502",
      status: 502,
    });
  });
});
